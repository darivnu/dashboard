import { Elysia, t } from 'elysia'
import { Type } from '@sinclair/typebox'
import { createTtlCache } from '../../lib/cache'
import { httpClient } from '../../lib/http'
import { auth } from '../../plugins/session'
import { getProvider } from '../../services/oauth/providers'
import { createTokenManager } from '../../services/oauth/tokens'
import { subscriptionsRepo } from '../subscriptions/subscriptions.repo'
import { dashboardRepo } from './dashboard.repo'
import type { WidgetInstance } from './dashboard.repo'
import { createDashboardService } from './dashboard.service'
import { createDataService } from './data.service'
import type { CachedWidgetData } from './data.service'

const GRID_MAX = 10_000
const REFRESH_MAX = 86_400
const MAX_LAYOUT_ITEMS = 200

const dashboardService = createDashboardService(dashboardRepo)
const dataService = createDataService({
    repo: dashboardRepo,
    subscriptions: subscriptionsRepo,
    http: httpClient,
    tokens: createTokenManager({ repo: subscriptionsRepo, getProvider }),
    cache: createTtlCache<CachedWidgetData>(),
})

const instanceId = t.String({ format: 'uuid', description: 'Widget instance id' })

const position = {
    x: Type.Integer({ minimum: 0, maximum: GRID_MAX, description: 'Column, in grid units' }),
    y: Type.Integer({ minimum: 0, maximum: GRID_MAX, description: 'Row, in grid units' }),
    w: Type.Integer({ minimum: 1, maximum: GRID_MAX, description: 'Width, in grid units' }),
    h: Type.Integer({ minimum: 1, maximum: GRID_MAX, description: 'Height, in grid units' }),
}

const paramsSchema = t.Record(
    t.String({ maxLength: 64 }),
    t.Union([t.String({ maxLength: 500 }), t.Number()]),
    {
        maxProperties: 50,
        description: 'Widget params keyed by ParamDef.name; checked against the widget definition from the catalog',
        examples: [{ city: 'Paris', days: 3 }],
    },
)

const titleSchema = t.Nullable(t.String({ minLength: 1, maxLength: 100 }), {
    description: 'Custom title; null shows the widget\'s own name',
})

const refreshSecondsSchema = Type.Integer({
    minimum: 5,
    maximum: REFRESH_MAX,
    description: 'Seconds between refreshes. Defaults to the widget\'s refresh.default; rejected below its refresh.min',
    examples: [300],
})

const instanceSchema = t.Object({
    id: instanceId,
    serviceId: t.String({ examples: ['weather'] }),
    widgetId: t.String({ examples: ['forecast'] }),
    title: titleSchema,
    params: paramsSchema,
    refreshSeconds: refreshSecondsSchema,
    ...position,
    enabled: t.Boolean(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
}, { description: 'A configured widget on the current user\'s dashboard' })

const instanceListSchema = t.Object({
    instances: t.Array(instanceSchema),
}, { description: 'The current user\'s widget instances, oldest first' })

const createBody = t.Object({
    serviceId: t.String({ minLength: 1, maxLength: 64, examples: ['weather'] }),
    widgetId: t.String({ minLength: 1, maxLength: 64, examples: ['forecast'] }),
    title: t.Optional(titleSchema),
    params: t.Optional(paramsSchema),
    refreshSeconds: t.Optional(refreshSecondsSchema),
    x: t.Optional(position.x),
    y: t.Optional(position.y),
    w: t.Optional(position.w),
    h: t.Optional(position.h),
    enabled: t.Optional(t.Boolean()),
})

const updateBody = t.Object({
    title: t.Optional(titleSchema),
    params: t.Optional(paramsSchema),
    refreshSeconds: t.Optional(refreshSecondsSchema),
    x: t.Optional(position.x),
    y: t.Optional(position.y),
    w: t.Optional(position.w),
    h: t.Optional(position.h),
    enabled: t.Optional(t.Boolean()),
}, { description: 'Only the fields present are changed. `params`, when present, replaces the whole object' })

const layoutBody = t.Array(
    t.Object({ id: instanceId, ...position }),
    { minItems: 1, maxItems: MAX_LAYOUT_ITEMS, description: 'New positions, applied all together or not at all' },
)

const dataSchema = t.Union([
    t.Object({
        ok: t.Literal(true),
        data: t.Unknown({ description: 'Whatever the widget\'s fetch() returned' }),
        fetchedAt: t.Date({ description: 'When the data was fetched from the upstream service; older than now when served from cache' }),
    }),
    t.Object({
        ok: t.Literal(false),
        code: t.Union([
            t.Literal('needs_reauth'),
            t.Literal('rate_limited'),
            t.Literal('upstream_error'),
            t.Literal('invalid_config'),
        ]),
    }),
], { description: 'Widget data, or the reason it is unavailable' })

const okSchema = t.Object({ ok: t.Literal(true) })

const errorSchema = t.Object({
    error: t.String({ examples: ['NOT_FOUND'] }),
    message: t.String({ examples: ['Widget instance not found'] }),
}, { description: 'Error envelope produced by the global error handler' })

const idParams = t.Object({ id: instanceId })

function toInstance(row: WidgetInstance) {
    return {
        id: row.id,
        serviceId: row.serviceId,
        widgetId: row.widgetId,
        title: row.title,
        params: row.params,
        refreshSeconds: row.refreshSeconds,
        x: row.x,
        y: row.y,
        w: row.w,
        h: row.h,
        enabled: row.enabled,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }
}

export const dashboardRoutes = new Elysia({
    prefix: '/dashboard',
    detail: {
        tags: ['Dashboard'],
        security: [{ cookieAuth: [] }],
    },
})
    .use(auth)
    .model({
        'dashboard.instance': instanceSchema,
        'dashboard.instanceList': instanceListSchema,
        'dashboard.createBody': createBody,
        'dashboard.updateBody': updateBody,
        'dashboard.layoutBody': layoutBody,
        'dashboard.data': dataSchema,
        'dashboard.ok': okSchema,
        'dashboard.error': errorSchema,
    })
    .get('/instances', async ({ user }) => {
        const rows = await dashboardService.list(user.id)
        return { instances: rows.map(toInstance) }
    }, {
        auth: true,
        response: {
            200: 'dashboard.instanceList',
            401: 'dashboard.error',
        },
        detail: {
            summary: 'List my widget instances',
            description: 'Returns only the instances of the authenticated user.',
        },
    })
    .post('/instances', async ({ user, body, set }) => {
        const row = await dashboardService.create(user.id, body)
        set.status = 201
        return toInstance(row)
    }, {
        auth: true,
        body: 'dashboard.createBody',
        response: {
            201: 'dashboard.instance',
            400: 'dashboard.error',
            401: 'dashboard.error',
        },
        detail: {
            summary: 'Add a widget to my dashboard',
            description: 'Params are validated against the widget definition (see GET /api/catalog); defaults are filled in and unknown params are dropped. 400 when the service or widget is unknown, a\
required param is missing, a param has the wrong type, or refreshSeconds is below the widget\'s refresh.min.',
        },
    })
    .patch('/instances/:id', async ({ user, params, body }) => {
        const row = await dashboardService.update(user.id, params.id, body)
        return toInstance(row)
    }, {
        auth: true,
        params: idParams,
        body: 'dashboard.updateBody',
        response: {
            200: 'dashboard.instance',
            400: 'dashboard.error',
            401: 'dashboard.error',
            404: 'dashboard.error',
        },
        detail: {
            summary: 'Change one of my widget instances',
            description: 'Partial update. An instance that does not exist and an instance that belongs to someone else both answer 404.',
        },
    })
    .delete('/instances/:id', async ({ user, params }) => {
        await dashboardService.remove(user.id, params.id)
        return { ok: true }
    }, {
        auth: true,
        params: idParams,
        response: {
            200: 'dashboard.ok',
            400: 'dashboard.error',
            401: 'dashboard.error',
            404: 'dashboard.error',
        },
        detail: {
            summary: 'Remove a widget from my dashboard',
            description: 'An instance that does not exist and an instance that belongs to someone else both answer 404.',
        },
    })
    .patch('/layout', async ({ user, body }) => {
        const rows = await dashboardService.updateLayout(user.id, body)
        return { instances: rows.map(toInstance) }
    }, {
        auth: true,
        body: 'dashboard.layoutBody',
        response: {
            200: 'dashboard.instanceList',
            400: 'dashboard.error',
            401: 'dashboard.error',
            404: 'dashboard.error',
        },
        detail: {
            summary: 'Move and resize several instances at once',
            description: 'Applied in one transaction: if any id is unknown or belongs to someone else the answer is 404 and nothing changes. An id may appear only once. Returns the full list after the change.',
        },
    })
    .get('/instances/:id/data', ({ user, params }) => dataService.getInstanceData(user.id, params.id), {
        auth: true,
        params: idParams,
        response: {
            200: 'dashboard.data',
            400: 'dashboard.error',
            401: 'dashboard.error',
            404: 'dashboard.error',
        },
        detail: {
            summary: 'Fetch the data of one widget instance',
            description: 'Always 200 when the instance is yours: a widget that cannot produce data answers { ok: false, code } instead of an HTTP error, so one failing widget does not break the dashboard.\
Results are cached for the widget\'s refresh.min seconds; failures are never cached. Services that need credentials answer needs_reauth for now.',
        },
    })