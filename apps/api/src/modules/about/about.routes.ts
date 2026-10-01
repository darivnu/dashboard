import { Elysia, t } from 'elysia'
import { registry } from '../../services/registry'
import { getClientIp } from '../../lib/http'
import { cors } from '../../plugins/cors'

const paramSchema = t.Object({
    name: t.String(),
    type: t.Union([t.Literal('string'), t.Literal('integer')]),
})

const widgetSchema = t.Object({
    name: t.String(),
    description: t.String(),
    params: t.Array(paramSchema),
})

const serviceSchema = t.Object({
    name: t.String(),
    widgets: t.Array(widgetSchema),
})

export const aboutRoutes = new Elysia()
    .use(cors)
    .model({
        'about.response': t.Object({
            client: t.Object({
                host: t.String(),
            }),
            server: t.Object({
                current_time: t.Integer(),
                services: t.Array(serviceSchema),
            }),
        }),
    })
    .get('/about.json', ({ request, server }) => {
        const host = getClientIp(request, server)

        return {
            client: { host },
            server: {
                current_time: Math.floor(Date.now() / 1000),
                services: registry.listServices().map((service) => ({
                    name: service.name,
                    widgets: service.widgets.map((widget) => ({
                        name: widget.name,
                        description: widget.description,
                        params: widget.params.map((param) => ({
                            name: param.name,
                            type: param.type,
                        })),
                    })),
                })),
            },
        }
    }, {
        response: 'about.response',
    })