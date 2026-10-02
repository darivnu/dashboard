import { Elysia, t } from 'elysia'
import { Type } from '@sinclair/typebox'
import { auth } from '../../plugins/session'
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
    t.Object({ kind: t.Literal('oauth2') }),
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
    return { ...base, type: param.type, default: param.default }
}

function toAuth(serviceAuth: ServiceAuth) {
    if (serviceAuth.kind === 'apiKey') {
        return { kind: serviceAuth.kind, fields: serviceAuth.fields.map(toParam) }
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
    .get('', () => ({
        services: registry.listServices().map(toService),
    }), {
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