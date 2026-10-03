import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { ALICE, BOB, fakeSession, loggedIn } from '../../plugins/session.fakes'
import { errorHandler } from '../../lib/errors'
import { __resetRegistryForTests, registry } from '../../services/registry'
import type { ServiceDef } from '../../services/types'
import { createFakeSubscriptionsRepo } from '../subscriptions/subscriptions.fakes'

// The routes file reads subscriptions through the real Drizzle repo; swap it
// for the in-memory one before loading the routes.
const repo = createFakeSubscriptionsRepo()
mock.module('../subscriptions/subscriptions.repo', () => ({ subscriptionsRepo: repo }))

// Loaded after session.fakes has replaced db/client.
const { catalogRoutes } = await import('./catalog.routes')

const app = new Elysia().use(errorHandler).use(catalogRoutes)

// A fake API key: the catalog must never send it back.
const SECRET = 'super-secret-key-123'

async function getCatalog(headers?: Record<string, string>) {
    const response = await app.handle(new Request('http://localhost/catalog', { headers }))
    const text = await response.text()
    return { status: response.status, body: JSON.parse(text), text }
}

// Registers an apiKey service, so there is something to subscribe to.
function registerStocks() {
    registry.register({
        id: 'stocks',
        name: 'Stocks',
        auth: { kind: 'apiKey', fields: [{ name: 'apiKey', type: 'string', label: 'API key', required: true }] },
        widgets: [],
    })
}

beforeEach(() => {
    __resetRegistryForTests()
    repo.rows.length = 0 //empty the fake table between tests
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
                    subscription: null,
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

describe('GET /catalog subscription status (#24)', () => {
    test('is null when the user is not subscribed', async () => {
        registerStocks()

        const { body } = await getCatalog(loggedIn)

        expect(body.services[0].subscription).toBeNull()
    })

    test('is { status: "active" } when the user is subscribed', async () => {
        registerStocks()
        await repo.upsert(ALICE.id, 'stocks', { apiKey: SECRET })

        const { body } = await getCatalog(loggedIn)

        expect(body.services[0].subscription).toEqual({ status: 'active' })
    })

    test('reflects needs_reauth', async () => {
        registerStocks()
        await repo.upsert(ALICE.id, 'stocks', { apiKey: SECRET })
        await repo.setStatus(ALICE.id, 'stocks', 'needs_reauth')

        const { body } = await getCatalog(loggedIn)

        expect(body.services[0].subscription).toEqual({ status: 'needs_reauth' })
    })

    test('each service gets its own status', async () => {
        registry.register({ id: 'radio', name: 'Radio', auth: { kind: 'none' }, widgets: [] })
        registerStocks()
        await repo.upsert(ALICE.id, 'stocks', { apiKey: SECRET })

        const { body } = await getCatalog(loggedIn)

        expect(body.services[0].subscription).toBeNull()
        expect(body.services[1].subscription).toEqual({ status: 'active' })
    })

    test('another user\'s subscription does not show up', async () => {
        registerStocks()
        await repo.upsert(BOB.id, 'stocks', { apiKey: SECRET })

        const { body } = await getCatalog(loggedIn) //logged in as Alice

        expect(body.services[0].subscription).toBeNull()
    })

    test('the response contains no credentials', async () => {
        registerStocks()
        await repo.upsert(ALICE.id, 'stocks', { apiKey: SECRET })

        const { text } = await getCatalog(loggedIn)

        expect(text).not.toContain(SECRET)
        expect(text).not.toContain('credentials')
    })
})
