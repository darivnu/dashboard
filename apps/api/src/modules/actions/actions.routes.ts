import { Elysia, t } from 'elysia'
import { httpClient } from '../../lib/http'
import { createFixedWindowLimiter } from '../../lib/rate-limit'
import { auth } from '../../plugins/session'
import { createActionsService, RateLimitedError } from './actions.service'

//one limiter for the whole process: its counters must outlive a request
const actionsService = createActionsService({
    http: httpClient,
    limiter: createFixedWindowLimiter(),
})

// Left unchecked here on purpose: Elysia would turn a string or an array into
// an object before validating it. The service checks the real shape (step 3).
const paramsSchema = t.Unknown({
    description: 'Action params keyed by ParamDef.name, as an object of at most 50 string or number values; checked against the action definition from the catalog. Anything else is a 400 INVALID_PARAMS',
    examples: [{ message: 'hello' }],
})

const actionBody = t.Object({
    params: t.Optional(paramsSchema),
}, { description: 'Omitting `params` is the same as sending an empty object' })

const actionResult = t.Union([
    t.Object({
        ok: t.Literal(true),
        data: t.Unknown({ description: 'Whatever the action\'s run() returned; null when it returned nothing' }),
    }),
    t.Object({
        ok: t.Literal(false),
        code: t.Union([
            t.Literal('needs_reauth'),
            t.Literal('rate_limited'),
            t.Literal('upstream_error'),
        ], { description: 'needs_reauth: the service needs credentials; rate_limited: the upstream service refused the call; upstream_error: the upstream service failed' }),
    }),
], { description: 'The result of the action, or the reason it could not be carried out' })

const errorResponse = t.Object({
    error: t.String({ examples: ['RATE_LIMITED'] }),
    message: t.String({ examples: ['Too many requests, try again later'] }),
}, { description: 'Error envelope produced by the global error handler' })

const actionParams = t.Object({
    serviceId: t.String({ description: 'Service id from the catalog', examples: ['mock'] }),
    actionId: t.String({ description: 'Action id from the service\'s `actions` in the catalog', examples: ['ping'] }),
})

export const actionsRoutes = new Elysia({
    prefix: '/services',
    detail: {
        tags: ['Actions'],
        security: [{ cookieAuth: [] }],
    },
})
    .use(auth)
    .model({
        'actions.body': actionBody,
        'actions.result': actionResult,
        'actions.error': errorResponse,
    })
    .post('/:serviceId/actions/:actionId', async ({ user, params, body, set }) => {
        try {
            return await actionsService.runAction(user.id, params.serviceId, params.actionId, body.params)
        } catch (error) {
            //the error handler writes the body; only the route can add the header
            if (error instanceof RateLimitedError)
                set.headers['Retry-After'] = String(error.retryAfterSeconds)
            throw error
        }
    }, {
        auth: true,
        params: actionParams,
        body: 'actions.body',
        response: {
            200: 'actions.result',
            400: 'actions.error',
            401: 'actions.error',
            404: 'actions.error',
            429: 'actions.error',
        },
        detail: {
            summary: 'Run an action of a service',
            description: 'Runs one of the actions a service lists in GET /api/catalog, on demand. Params are validated against the action definition: defaults are filled in and unknown params are dropped. \
404 when the service or the action is unknown. 429 with a Retry-After header when the action declares a rate limit and the current user is over it; the limit is counted per user and per action, and a call with invalid params still counts. \
400 INVALID_PARAMS when a required param is missing or a param has the wrong type or is out of range. Otherwise always 200: an action that cannot be carried out answers { ok: false, code } instead of an HTTP error. \
Results are never cached. Actions of services that need credentials answer needs_reauth for now.',
        },
    })
