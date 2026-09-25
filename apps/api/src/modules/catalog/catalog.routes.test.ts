import { beforeEach, describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { ALICE, fakeSession, loggedIn } from '../../plugins/session.fakes'
import { errorHandler } from '../../lib/errors'
import { __resetRegistryForTests, registry } from '../../services/registry'
import type { ServiceDef } from '../../services/types'

// Loaded after session.fakes has replaced db/client.
const { catalogRoutes } = await import('./catalog.routes')

const app = new Elysia().use(errorHandler).use(catalogRoutes)

async function getCatalog(headers?: Record<string, string>) {
    const response = await app.handle(new Request('http://localhost/catalog', { headers }))
    return { status: response.status, body: await response.json() }
}

beforeEach(() => {
    __resetRegistryForTests()
    fakeSession.user = ALICE
})

describe('GET /catalog', () => {
    test('answers 401 without a session', async () => {
        const { status, body } = await getCatalog()

        expect(status).toBe(401)
        expect(body.error).toBe('UNAUTHORIZED')
    })

    test('answers 401 when the session token is unknown', async () => {
        fakeSession.user = null

        const { status } = await getCatalog(loggedIn)

        expect(status).toBe(401)
    })

    test('is empty when nothing is registered', async () => {
        const { status, body } = await getCatalog(loggedIn)

        expect(status).toBe(200)
        expect(body).toEqual({ services: [] })
    })

    test('a registered ServiceDef appears with no other change', async () => {
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

        const { body } = await getCatalog(loggedIn)

        expect(body).toEqual({
            services: [
                {
                    id: 'weather',
                    name: 'Weather',
                    auth: { kind: 'none' },
                    widgets: [
                        {
                            id: 'forecast',
                            name: 'Forecast',
                            description: 'Shows the forecast',
                            params: [
                                { name: 'city', label: 'City', required: true, type: 'string' },
                                { name: 'days', label: 'Days', required: false, type: 'integer', default: 5 },
                            ],
                            refresh: { default: 3600, min: 300 },
                        },
                    ],
                },
            ],
        })
    })

    test('exposes auth.fields for apiKey services and nothing but the kind for oauth2', async () => {
        registry.register({
            id: 'keyed',
            name: 'Keyed',
            auth: { kind: 'apiKey', fields: [{ name: 'token', type: 'string', label: 'Token', required: true }] },
            widgets: [],
        })
        registry.register({
            id: 'oauthed',
            name: 'OAuthed',
            auth: { kind: 'oauth2', provider: 'github', scopes: ['repo'] },
            widgets: [],
        })

        const { body } = await getCatalog(loggedIn)

        expect(body.services[0].auth).toEqual({
            kind: 'apiKey',
            fields: [{ name: 'token', label: 'Token', required: true, type: 'string' }],
        })
        expect(body.services[1].auth).toEqual({ kind: 'oauth2' })
    })

    test('lists services in registration order, each with its own widgets', async () => {
        registry.register({ id: 'one', name: 'One', auth: { kind: 'none' }, widgets: [] })
        registry.register({ id: 'two', name: 'Two', auth: { kind: 'none' }, widgets: [] })

        const { body } = await getCatalog(loggedIn)

        expect(body.services.map((service: { id: string }) => service.id)).toEqual(['one', 'two'])
    })
})
