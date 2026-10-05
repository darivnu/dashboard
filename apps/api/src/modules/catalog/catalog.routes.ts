import { Elysia, t } from 'elysia'
import { Type } from '@sinclair/typebox'
import { auth } from '../../plugins/session'
import { getProvider } from '../../services/oauth/providers'
import { registry } from '../../services/registry'
import type { ParamDef, ServiceAuth, ServiceDef, WidgetDef } from '../../services/types'
//import { SubscriptionStatus } from '../subscriptions/subscriptions.repo'
import { subscriptionsRepo, type SubscriptionStatus } from '../subscriptions/subscriptions.repo'

const paramBase = {
    name: t.String({
        description: 'Key to use for this param in a widget instance\'s `params` object',
        examples: ['city'],
    }),
    label: t.String({
        description: 'Human-readable label for a configuration form',
        examples: ['City'],
    }),
    required: t.Boolean({
        description: 'When true, creating an instance without this param is rejected with 400',
    }),
}

const paramSchema = t.Union([
    t.Object({
        ...paramBase,
        type: t.Literal('string'),
        default: t.Optional(t.String({ description: 'Value stored when the param is omitted' })),
    }),
    t.Object({
        ...paramBase,
        type: t.Literal('integer'),
        default: t.Optional(Type.Integer({ description: 'Value stored when the param is omitted' })),
        min: t.Optional(Type.Integer({
            description: 'Lowest value accepted, inclusive; a lower one is rejected with 400. Absent when the param has no lower bound',
            examples: [1],
        })),
        max: t.Optional(Type.Integer({
            description: 'Highest value accepted, inclusive; a higher one is rejected with 400. Absent when the param has no upper bound',
            examples: [500],
        })),
    }),
])

const authSchema = t.Union([
    t.Object({ kind: t.Literal('none') }),
    t.Object({
        kind: t.Literal('apiKey'),
        fields: t.Array(paramSchema, {
            description: 'Credentials the user must provide to subscribe to this service',
        }),
    }),
    t.Object({
        kind: t.Literal('oauth2'),
        provider: t.String({ description: 'OAuth provider the user connects to', examples: ['github'] }),
        available: t.Boolean({
            description: 'False when the server has no credentials for this provider: connecting is impossible for now',
        }),
    }),
])

const widgetSchema = t.Object({
    id: t.String({ examples: ['forecast'] }),
    name: t.String({ examples: ['Forecast'] }),
    description: t.String(),
    params: t.Array(paramSchema),
    refresh: t.Object({
        default: Type.Integer({
            description: 'refreshSeconds used when an instance does not specify one',
            examples: [3600],
        }),
        min: Type.Integer({
            description: 'Lowest refreshSeconds accepted; also how long fetched data is cached',
            examples: [300],
        }),
    }),
})

const subscriptionStatusSchema = t.Nullable(//why is it nullable? because the user may not be subscribed to this service
    t.Object({
        status: t.Union([t.Literal('active'), t.Literal('needs_reauth'), t.Literal('revoked')]),
    }, { description: 'The current user\'s subscription to this service; null when not subscribed' })
)

const serviceSchema = t.Object({
    id: t.String({ examples: ['weather'] }),
    name: t.String({ examples: ['Weather'] }),
    auth: authSchema,
    subscription: subscriptionStatusSchema,
    widgets: t.Array(widgetSchema),
})

const catalogResponse = t.Object({
    services: t.Array(serviceSchema),
}, { description: 'Every registered service with its widgets' })

const errorResponse = t.Object({
    error: t.String({ examples: ['UNAUTHORIZED'] }),
    message: t.String({ examples: ['Authentication required'] }),
}, { description: 'Error envelope produced by the global error handler' })

function toParam(param: ParamDef) {
    const base = {
        name: param.name,
        label: param.label,
        required: param.required ?? false,
    }

    if (param.type === 'string') {
        return { ...base, type: param.type, default: param.default }
    }
    // Undeclared min / max are undefined here and drop out of the JSON, the
    // same way an undeclared default does.
    return { ...base, type: param.type, default: param.default, min: param.min, max: param.max }
}

function toAuth(serviceAuth: ServiceAuth) {
    if (serviceAuth.kind === 'apiKey') {
        return { kind: serviceAuth.kind, fields: serviceAuth.fields.map(toParam) }
    }
    if (serviceAuth.kind === 'oauth2') {
        //never the scopes or anything else from the definition: just what the Connect button needs
        return { kind: serviceAuth.kind, provider: serviceAuth.provider, available: getProvider(serviceAuth.provider) !== null }
    }
    return { kind: serviceAuth.kind }
}

function toWidget(widget: WidgetDef) {
    return {
        id: widget.id,
        name: widget.name,
        description: widget.description,
        params: widget.params.map(toParam),
        refresh: { default: widget.refresh.default, min: widget.refresh.min },
    }
}

function toService(service: ServiceDef, status: SubscriptionStatus | undefined) {
    return {
        id: service.id,
        name: service.name,
        auth: toAuth(service.auth),
        widgets: service.widgets.map(toWidget),
        subscription: status ? { status } : null, //null when the user is not subscribed (ternary op)
    }
}

export const catalogRoutes = new Elysia({
    prefix: '/catalog',
    detail: {
        tags: ['Catalog'],
        security: [{ cookieAuth: [] }],
    },
})
    .use(auth)
    .model({
        'catalog.response': catalogResponse,
        'catalog.error': errorResponse,
    })
    .get('', async({user}) => { //figure out who is asking
        const rows = await subscriptionsRepo.listByUser(user.id) //get all the subscriptions for this user,
        const satusByService = new Map(rows.map(row => [row.serviceId, row.status])) //map the serviceId to the status of the subscription
        return {
            services: registry.listServices().map(service => toService(service, satusByService.get(service.id))) //get all the services and map them to the service schema, including the subscription status
        }
    }, {
        auth: true,
        response: {
            200: 'catalog.response',
            401: 'catalog.error',
        },
        detail: {
            summary: 'List available services and widgets',
            description: 'Everything a client needs to build a widget configuration form: each service with its auth kind, and each widget with its params and refresh bounds. Derived from the service \
            registry at request time, so a newly registered service appears without any change here.',
        },
    })