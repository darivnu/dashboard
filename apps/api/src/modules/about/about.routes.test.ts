import { beforeEach, describe, expect, test } from 'bun:test'
import { aboutRoutes } from './about.routes'
import { __resetRegistryForTests, registry } from '../../services/registry'
import type { ServiceDef } from '../../services/types'

beforeEach(() => {
    __resetRegistryForTests()
})

async function getAbout(headers?: Record<string, string>) {
    const response = await aboutRoutes.handle(
        new Request('http://localhost/about.json', { headers }),
    )
    return { status: response.status, body: await response.json() }
}

describe('GET /about.json', () => {
    test('reports an empty services list when nothing is registered', async () => {
        const { status, body } = await getAbout()

        expect(status).toBe(200)
        expect(body.server.services).toEqual([])
        expect(typeof body.server.current_time).toBe('number')
    })

    test('reports a registered service and its widgets', async () => {
        const def: ServiceDef = {
            id: 'weather',
            name: 'Weather',
            auth: { kind: 'none' },
            widgets: [
                {
                    id: 'forecast',
                    name: 'Forecast',
                    description: 'Shows the forecast',
                    params: [
                        { name: 'city', type: 'string', label: 'City', required: true },
                        { name: 'days', type: 'integer', label: 'Days', default: 5 },
                    ],
                    refresh: { default: 3600, min: 300 },
                    fetch: async () => ({}),
                },
            ],
        }
        registry.register(def)

        const { body } = await getAbout()

        expect(body.server.services).toEqual([
            {
                name: 'Weather',
                widgets: [
                    {
                        name: 'Forecast',
                        description: 'Shows the forecast',
                        params: [
                            { name: 'city', type: 'string' },
                            { name: 'days', type: 'integer' },
                        ],
                    },
                ],
            },
        ])
    })

    test('uses the first X-Forwarded-For entry as client.host', async () => {
        const { body } = await getAbout({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })

        expect(body.client.host).toBe('1.2.3.4')
    })

    test('falls back to an empty host when there is no X-Forwarded-For header', async () => {
        const { body } = await getAbout()

        expect(body.client.host).toBe('')
    })
})
