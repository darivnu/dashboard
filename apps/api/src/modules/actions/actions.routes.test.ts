import { beforeEach, describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { fakeSession, fakeUser, loggedIn } from '../../plugins/session.fakes'
import { errorHandler } from '../../lib/errors'
import { rateLimit } from '../../plugins/rate-limit'
import { registerServices } from '../../services/register'
import { __resetRegistryForTests, registry } from '../../services/registry'

// Loaded after session.fakes has replaced db/client.
const { actionsRoutes } = await import('./actions.routes')

// A route behind the IP limiter that guards login, to prove the two limiters are separate.
const ipLimited = new Elysia().use(rateLimit).get('/ip-limited', () => ({ ok: true }))

const app = new Elysia().use(errorHandler).use(actionsRoutes).use(ipLimited)

let keyedRuns = 0
let waveRuns = 0

interface CallOptions {
    body?: unknown
    session?: boolean
    headers?: Record<string, string>
}

async function call(serviceId: string, actionId: string, options: CallOptions = {}) {
    const headers: Record<string, string> = { ...options.headers }
    if (options.session !== false) Object.assign(headers, loggedIn)

    const hasBody = 'body' in options
    if (hasBody) headers['content-type'] = 'application/json'

    const response = await app.handle(new Request(`http://localhost/services/${serviceId}/actions/${actionId}`, {
        method: 'POST',
        headers,
        body: hasBody ? JSON.stringify(options.body) : undefined,
    }))
    return { status: response.status, retryAfter: response.headers.get('retry-after'), body: await response.json() }
}

const ping = (params: Record<string, unknown>) => call('mock', 'ping', { body: { params } })

// The routes file owns one limiter for the whole process, so each test acts as
// a user nobody has seen before: ping's 5-per-minute budget never leaks between tests.
function freshUser() {
    const user = fakeUser(crypto.randomUUID(), 'someone@example.com')
    fakeSession.user = user
    return user
}

beforeEach(() => {
    keyedRuns = 0
    waveRuns = 0
    freshUser()

    __resetRegistryForTests()
    registerServices('development')
    registry.register({
        id: 'keyed',
        name: 'Keyed',
        auth: { kind: 'apiKey', fields: [{ name: 'apiKey', type: 'string', label: 'API key', required: true }] },
        widgets: [],
        actions: [
            {
                id: 'poke',
                name: 'Poke',
                description: 'Pokes',
                params: [],
                run: async () => {
                    keyedRuns += 1
                    return {}
                },
            },
        ],
    })
    // Only an optional param: nothing but the shape of `params` can make a call invalid.
    registry.register({
        id: 'open',
        name: 'Open',
        auth: { kind: 'none' },
        widgets: [],
        actions: [
            {
                id: 'wave',
                name: 'Wave',
                description: 'Waves',
                params: [{ name: 'note', type: 'string', label: 'Note' }],
                run: async () => {
                    waveRuns += 1
                    return {}
                },
            },
        ],
    })
})

describe('POST /services/:serviceId/actions/:actionId', () => {
    describe('without a session', () => {
        test.each([
            ['a valid call', 'mock', 'ping', { params: { message: 'hi' } }],
            ['an unknown action', 'mock', 'nope', { params: {} }],
            ['a wrongly shaped `params`', 'mock', 'ping', { params: 42 }],
        ])('%s is 401', async (_label, serviceId, actionId, body) => {
            const { status, body: responseBody } = await call(serviceId, actionId, { body, session: false })

            expect(status).toBe(401)
            expect(responseBody).toEqual({ error: 'UNAUTHORIZED', message: 'Authentication required' })
        })

        test('an unknown session token is 401', async () => {
            fakeSession.user = null

            expect((await ping({ message: 'hi' })).status).toBe(401)
        })
    })

    test('runs ping and answers { ok: true, data }', async () => {
        const { status, body } = await ping({ message: 'hello' })

        expect(status).toBe(200)
        expect(body).toMatchObject({ ok: true, data: { message: 'hello' } })
        expect(typeof body.data.timestamp).toBe('string')
        expect(Object.keys(body).sort()).toEqual(['data', 'ok'])
    })

    test('an unknown service is 404 NOT_FOUND', async () => {
        const { status, body } = await call('nope', 'ping', { body: { params: { message: 'hi' } } })

        expect(status).toBe(404)
        expect(body.error).toBe('NOT_FOUND')
    })

    test('an unknown action is 404 NOT_FOUND', async () => {
        const { status, body } = await call('mock', 'nope', { body: { params: {} } })

        expect(status).toBe(404)
        expect(body.error).toBe('NOT_FOUND')
    })

    test('a widget id is not an action id', async () => {
        expect((await call('mock', 'echo', { body: { params: { message: 'hi' } } })).status).toBe(404)
    })

    test('a missing message is 400 INVALID_PARAMS', async () => {
        const { status, body } = await ping({})

        expect(status).toBe(400)
        expect(body.error).toBe('INVALID_PARAMS')
    })

    test('a body without `params` counts as empty params', async () => {
        const { status, body } = await call('mock', 'ping', { body: {} })

        expect(status).toBe(400)
        expect(body.error).toBe('INVALID_PARAMS')
    })

    test('a request with no body at all is a 400', async () => {
        const { status, body } = await call('mock', 'ping')

        expect(status).toBe(400)
        expect(typeof body.error).toBe('string')
    })

    test.each([
        ['a string', 'hi'],
        ['an array', ['hi']],
        ['a number', 42],
    ])('`params` given as %s is 400 INVALID_PARAMS and the action does not run', async (_label, params) => {
        const { status, body } = await call('open', 'wave', { body: { params } })

        expect(status).toBe(400)
        expect(body).toEqual({ error: 'INVALID_PARAMS', message: 'params must be an object' })
        expect(waveRuns).toBe(0)
    })

    test('an action with only optional params runs with an empty `params` or none', async () => {
        expect((await call('open', 'wave', { body: { params: {} } })).body).toEqual({ ok: true, data: {} })
        expect((await call('open', 'wave', { body: {} })).body).toEqual({ ok: true, data: {} })
        expect(waveRuns).toBe(2)
    })

    test('fail: "invalid_config" is 400 INVALID_PARAMS', async () => {
        const { status, body } = await ping({ message: 'hi', fail: 'invalid_config' })

        expect(status).toBe(400)
        expect(body.error).toBe('INVALID_PARAMS')
    })

    test.each(['needs_reauth', 'rate_limited', 'upstream_error'])('fail: "%s" is 200 { ok: false, code }', async (code) => {
        const { status, body } = await ping({ message: 'hi', fail: code })

        expect(status).toBe(200)
        expect(body).toEqual({ ok: false, code })
    })

    test('an action of an apiKey service answers needs_reauth without running', async () => {
        const { status, body } = await call('keyed', 'poke', { body: { params: {} } })

        expect(status).toBe(200)
        expect(body).toEqual({ ok: false, code: 'needs_reauth' })
        expect(keyedRuns).toBe(0)
    })

    test('two identical calls both run: the timestamps come from two runs', async () => {
        const first = await ping({ message: 'same' })
        await Bun.sleep(5)
        const second = await ping({ message: 'same' })

        expect(first.body.ok && second.body.ok).toBe(true)
        expect(second.body.data.timestamp).not.toBe(first.body.data.timestamp)
    })

    describe('rate limit', () => {
        test('the 6th ping within the window is 429 with Retry-After', async () => {
            for (let i = 0; i < 5; i += 1) {
                expect((await ping({ message: 'hi' })).status).toBe(200)
            }

            const { status, body, retryAfter } = await ping({ message: 'hi' })

            expect(status).toBe(429)
            expect(body).toEqual({ error: 'RATE_LIMITED', message: 'Too many requests, try again later' })
            expect(Number(retryAfter)).toBeGreaterThan(0)
            expect(Number(retryAfter)).toBeLessThanOrEqual(60)
        })

        test('an allowed call carries no Retry-After', async () => {
            expect((await ping({ message: 'hi' })).retryAfter).toBeNull()
        })

        test('another user is not affected', async () => {
            for (let i = 0; i < 6; i += 1) await ping({ message: 'hi' })
            expect((await ping({ message: 'hi' })).status).toBe(429)

            freshUser()

            expect((await ping({ message: 'hi' })).status).toBe(200)
        })

        test('the login (IP) limiter is not affected, in either direction', async () => {
            const fromOneIp = { 'x-forwarded-for': '203.0.113.7' }

            // 12 pings from one IP by different users: more than the IP limiter's 10 per minute.
            for (let i = 0; i < 12; i += 1) {
                freshUser()
                const { status } = await call('mock', 'ping', { body: { params: { message: 'hi' } }, headers: fromOneIp })
                expect(status).toBe(200)
            }

            // One user over ping's own limit.
            for (let i = 0; i < 6; i += 1) await call('mock', 'ping', { body: { params: { message: 'hi' } }, headers: fromOneIp })

            const response = await app.handle(new Request('http://localhost/ip-limited', { headers: fromOneIp }))
            expect(response.status).toBe(200)
        })
    })

    test('with NODE_ENV=production the mock service and its action are gone: 404', async () => {
        __resetRegistryForTests()
        registerServices('production')

        const { status, body } = await ping({ message: 'hi' })

        expect(status).toBe(404)
        expect(body.error).toBe('NOT_FOUND')
    })
})
