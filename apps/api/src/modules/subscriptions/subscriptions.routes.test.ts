import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { ALICE, BOB, fakeSession, loggedIn } from '../../plugins/session.fakes'
import { errorHandler } from '../../lib/errors'
import { __resetRegistryForTests, registry } from '../../services/registry'
import { fakeService } from '../dashboard/dashboard.fakes'
import { createFakeSubscriptionsRepo } from './subscriptions.fakes'

// The routes file wires the real Drizzle repo at import time; swap it for the
// in-memory one before loading the routes.
const repo = createFakeSubscriptionsRepo()
mock.module('./subscriptions.repo', () => ({ subscriptionsRepo: repo }))

const { subscriptionsRoutes } = await import('./subscriptions.routes')

const app = new Elysia().use(errorHandler).use(subscriptionsRoutes)

const SECRET = 'super-secret-key-123'

async function call(method: string, path: string, options: { body?: unknown; session?: boolean } = {}) {
    const headers: Record<string, string> = {}
    if (options.session !== false) Object.assign(headers, loggedIn)
    if (options.body !== undefined) headers['content-type'] = 'application/json'

    const response = await app.handle(new Request(`http://localhost/subscriptions${path}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    }))
    const text = await response.text()
    return { status: response.status, body: JSON.parse(text), text }
}

function subscribeStocks(apiKey = SECRET) {
    return call('POST', '/stocks', { body: { apiKey } })
}

beforeEach(() => {
    repo.rows.length = 0
    fakeSession.user = ALICE

    __resetRegistryForTests()
    registry.register(fakeService()) // 'weather', auth: none
    registry.register(fakeService({
        id: 'stocks',
        name: 'Stocks',
        auth: {
            kind: 'apiKey',
            fields: [{ name: 'apiKey', type: 'string', label: 'API key', required: true }],
        },
    }))
})

describe('without a session', () => {
    const routes: [string, string, unknown?][] = [
        ['GET', '/'],
        ['POST', '/stocks', { apiKey: SECRET }],
        ['DELETE', '/stocks'],
    ]

    for (const [method, path, body] of routes) {
        test(`${method} ${path} is 401`, async () => {
            const { status, body: responseBody } = await call(method, path, { body, session: false })

            expect(status).toBe(401)
            expect(responseBody).toEqual({ error: 'UNAUTHORIZED', message: 'Authentication required' })
        })
    }
})

describe('POST /:service', () => {
    test('subscribes, stores the credentials and never returns them', async () => {
        const { status, body, text } = await subscribeStocks()

        expect(status).toBe(200)
        expect(Object.keys(body).sort()).toEqual(['createdAt', 'serviceId', 'status', 'updatedAt'])
        expect(body).toMatchObject({ serviceId: 'stocks', status: 'active' })
        expect(text).not.toContain(SECRET)

        expect(repo.rows).toHaveLength(1)
        expect(repo.rows[0]!.userId).toBe(ALICE.id)
        expect(repo.rows[0]!.credentials).toEqual({ apiKey: SECRET })
    })

    test('drops fields the service does not declare', async () => {
        await call('POST', '/stocks', { body: { apiKey: SECRET, extra: 'junk' } })

        expect(repo.rows[0]!.credentials).toEqual({ apiKey: SECRET })
    })

    test('re-subscribing replaces the credentials and resets the status to active', async () => {
        await subscribeStocks('old-key')
        await repo.setStatus(ALICE.id, 'stocks', 'needs_reauth')

        const { status, body } = await subscribeStocks('new-key')

        expect(status).toBe(200)
        expect(body.status).toBe('active')
        expect(repo.rows).toHaveLength(1)
        expect(repo.rows[0]!.credentials).toEqual({ apiKey: 'new-key' })
    })

    test('unknown service is 404', async () => {
        const { status, body } = await call('POST', '/nope', { body: { apiKey: SECRET } })

        expect(status).toBe(404)
        expect(body.error).toBe('NOT_FOUND')
        expect(repo.rows).toHaveLength(0)
    })

    test('a service that is not apiKey is 400', async () => {
        const { status, body } = await call('POST', '/weather', { body: { apiKey: SECRET } })

        expect(status).toBe(400)
        expect(body.error).toBe('NOT_API_KEY')
        expect(repo.rows).toHaveLength(0)
    })

    test('missing or invalid fields are 400 and do not echo the value', async () => {
        const cases: [string, unknown, string][] = [
            ['missing field', {}, 'INVALID_CREDENTIALS'],
            ['wrong type', { apiKey: 12345 }, 'INVALID_CREDENTIALS'],
            ['nested value', { apiKey: { secret: SECRET } }, 'VALIDATION'],
        ]

        for (const [label, body, error] of cases) {
            const response = await call('POST', '/stocks', { body })

            expect({ label, status: response.status, error: response.body.error }).toEqual({ label, status: 400, error })
            expect(response.text).not.toContain(SECRET)
        }
        expect(repo.rows).toHaveLength(0)
    })
})

describe('GET /', () => {
    test('lists only my subscriptions, without credentials', async () => {
        await subscribeStocks()
        fakeSession.user = BOB

        expect((await call('GET', '/')).body).toEqual({ subscriptions: [] })

        fakeSession.user = ALICE
        const { status, body, text } = await call('GET', '/')

        expect(status).toBe(200)
        expect(body.subscriptions).toHaveLength(1)
        expect(body.subscriptions[0]).toMatchObject({ serviceId: 'stocks', status: 'active' })
        expect(text).not.toContain(SECRET)
    })
})

describe('DELETE /:service', () => {
    test('deletes the row', async () => {
        await subscribeStocks()

        const { status, body } = await call('DELETE', '/stocks')

        expect(status).toBe(200)
        expect(body).toEqual({ ok: true })
        expect(repo.rows).toHaveLength(0)
    })

    test('someone else\'s subscription is 404 and stays', async () => {
        await subscribeStocks()
        fakeSession.user = BOB

        const { status, body } = await call('DELETE', '/stocks')

        expect(status).toBe(404)
        expect(body.error).toBe('NOT_FOUND')
        expect(repo.rows).toHaveLength(1)
    })

    test('a subscription that does not exist is 404', async () => {
        expect((await call('DELETE', '/stocks')).status).toBe(404)
    })
})
