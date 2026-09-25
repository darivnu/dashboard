import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { ALICE, BOB, fakeSession, loggedIn } from '../../plugins/session.fakes'
import { errorHandler } from '../../lib/errors'
import { __resetRegistryForTests, registry } from '../../services/registry'
import { WidgetFetchError } from '../../services/types'
import { createFakeRepo, fakeService, fakeWidget } from './dashboard.fakes'

// The routes file wires the real Drizzle repo at import time; swap it for the
// in-memory one before loading the routes.
const repo = createFakeRepo()
mock.module('./dashboard.repo', () => ({ dashboardRepo: repo }))

const { dashboardRoutes } = await import('./dashboard.routes')

const app = new Elysia().use(errorHandler).use(dashboardRoutes)

let fetchCalls = 0

async function call(method: string, path: string, options: { body?: unknown; session?: boolean } = {}) {
    const headers: Record<string, string> = {}
    if (options.session !== false) Object.assign(headers, loggedIn)
    if (options.body !== undefined) headers['content-type'] = 'application/json'

    const response = await app.handle(new Request(`http://localhost/dashboard${path}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    }))
    return { status: response.status, body: await response.json() }
}

function createParis() {
    return call('POST', '/instances', {
        body: { serviceId: 'weather', widgetId: 'forecast', params: { city: 'Paris' } },
    })
}

beforeEach(() => {
    repo.rows.length = 0
    fetchCalls = 0
    fakeSession.user = ALICE

    __resetRegistryForTests()
    registry.register(fakeService({
        widgets: [
            fakeWidget({
                // Distinct cities per test keep the module-level cache from leaking between tests.
                fetch: async (_ctx, params) => {
                    fetchCalls += 1
                    if (params.city === 'Limited') throw new WidgetFetchError('rate_limited', 'slow down')
                    return { city: params.city }
                },
            }),
        ],
    }))
})

describe('without a session', () => {
    const id = crypto.randomUUID()
    const routes: [string, string, unknown?][] = [
        ['GET', '/instances'],
        ['POST', '/instances', { serviceId: 'weather', widgetId: 'forecast', params: { city: 'Paris' } }],
        ['POST', '/instances', {}],
        ['PATCH', `/instances/${id}`, { title: 'x' }],
        ['PATCH', '/instances/not-a-uuid', { x: -1 }],
        ['DELETE', `/instances/${id}`],
        ['PATCH', '/layout', [{ id, x: 0, y: 0, w: 1, h: 1 }]],
        ['PATCH', '/layout', {}],
        ['GET', `/instances/${id}/data`],
    ]

    for (const [method, path, body] of routes) {
        test(`${method} ${path} with ${body === undefined ? 'no body' : JSON.stringify(body)} is 401`, async () => {
            const { status, body: responseBody } = await call(method, path, { body, session: false })

            expect(status).toBe(401)
            expect(responseBody).toEqual({ error: 'UNAUTHORIZED', message: 'Authentication required' })
        })
    }

    test('an unknown session token is 401 too', async () => {
        fakeSession.user = null

        expect((await call('GET', '/instances')).status).toBe(401)
        expect((await call('POST', '/instances', { body: {} })).status).toBe(401)
    })
})

describe('POST /instances', () => {
    test('creates with defaults, answers 201 and never exposes userId', async () => {
        const { status, body } = await createParis()

        expect(status).toBe(201)
        expect(body).toMatchObject({
            serviceId: 'weather',
            widgetId: 'forecast',
            title: null,
            params: { city: 'Paris', days: 5 },
            refreshSeconds: 3600,
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            enabled: true,
        })
        expect(Object.keys(body).sort()).toEqual([
            'createdAt', 'enabled', 'h', 'id', 'params', 'refreshSeconds',
            'serviceId', 'title', 'updatedAt', 'w', 'widgetId', 'x', 'y',
        ])
        expect(repo.rows[0]!.userId).toBe(ALICE.id)
    })

    test('answers 400 for every rejection in the issue', async () => {
        const base = { serviceId: 'weather', widgetId: 'forecast', params: { city: 'Paris' } }
        const cases: [string, unknown, string][] = [
            ['unknown service', { ...base, serviceId: 'nope' }, 'UNKNOWN_WIDGET'],
            ['unknown widget', { ...base, widgetId: 'nope' }, 'UNKNOWN_WIDGET'],
            ['missing required param', { ...base, params: {} }, 'INVALID_PARAMS'],
            ['wrong param type', { ...base, params: { city: 'Paris', days: 'many' } }, 'INVALID_PARAMS'],
            ['refresh below the widget minimum', { ...base, refreshSeconds: 299 }, 'REFRESH_TOO_LOW'],
            ['refresh below the global floor', { ...base, refreshSeconds: 1 }, 'VALIDATION'],
            ['negative position', { ...base, x: -1 }, 'VALIDATION'],
            ['nested param value', { ...base, params: { city: { evil: true } } }, 'VALIDATION'],
            ['missing serviceId', { widgetId: 'forecast' }, 'VALIDATION'],
        ]

        for (const [label, body, error] of cases) {
            const response = await call('POST', '/instances', { body })

            expect({ label, status: response.status, error: response.body.error }).toEqual({ label, status: 400, error })
        }
        expect(repo.rows).toHaveLength(0)
    })
})

describe('GET /instances', () => {
    test('lists only my instances', async () => {
        await createParis()
        fakeSession.user = BOB

        const { status, body } = await call('GET', '/instances')

        expect(status).toBe(200)
        expect(body).toEqual({ instances: [] })
    })
})

describe('another user\'s instance, or one that does not exist', () => {
    test('is 404 for update, delete and data, and nothing changes', async () => {
        const mine = (await createParis()).body
        fakeSession.user = BOB

        for (const id of [mine.id, crypto.randomUUID()]) {
            const responses = [
                await call('PATCH', `/instances/${id}`, { body: { title: 'hacked' } }),
                await call('DELETE', `/instances/${id}`),
                await call('GET', `/instances/${id}/data`),
            ]

            for (const response of responses) {
                expect(response.status).toBe(404)
                expect(response.body).toEqual({ error: 'NOT_FOUND', message: 'Widget instance not found' })
            }
        }
        expect(repo.rows).toHaveLength(1)
        expect(repo.rows[0]!.title).toBeNull()
        expect(fetchCalls).toBe(0)
    })

    test('any foreign id in PATCH /layout is 404 and nothing moves', async () => {
        const mine = (await createParis()).body
        fakeSession.user = BOB
        const theirs = (await createParis()).body

        const { status } = await call('PATCH', '/layout', {
            body: [
                { id: theirs.id, x: 5, y: 5, w: 5, h: 5 },
                { id: mine.id, x: 5, y: 5, w: 5, h: 5 },
            ],
        })

        expect(status).toBe(404)
        expect(repo.rows.map((row) => row.x)).toEqual([0, 0])
    })
})

describe('PATCH and DELETE', () => {
    test('update changes the fields sent and delete removes the instance', async () => {
        const mine = (await createParis()).body

        const updated = await call('PATCH', `/instances/${mine.id}`, { body: { title: 'Home', w: 6 } })
        expect(updated.status).toBe(200)
        expect(updated.body).toMatchObject({ id: mine.id, title: 'Home', w: 6, h: 3 })

        const deleted = await call('DELETE', `/instances/${mine.id}`)
        expect(deleted).toEqual({ status: 200, body: { ok: true } })
        expect(repo.rows).toHaveLength(0)
    })

    test('layout moves my instances and returns the list', async () => {
        const one = (await createParis()).body
        const two = (await createParis()).body

        const { status, body } = await call('PATCH', '/layout', {
            body: [
                { id: one.id, x: 1, y: 1, w: 2, h: 2 },
                { id: two.id, x: 3, y: 1, w: 2, h: 2 },
            ],
        })

        expect(status).toBe(200)
        expect(body.instances.map((instance: { x: number }) => instance.x)).toEqual([1, 3])
    })

    test('a malformed id is rejected before reaching the repo', async () => {
        const { status, body } = await call('DELETE', '/instances/not-a-uuid')

        expect(status).toBe(400)
        expect(body.error).toBe('VALIDATION')
    })
})

describe('GET /instances/:id/data', () => {
    test('is 200 with data, and the second call within the ttl is served from cache', async () => {
        const mine = (await call('POST', '/instances', {
            body: { serviceId: 'weather', widgetId: 'forecast', params: { city: 'Cached City' } },
        })).body

        const first = await call('GET', `/instances/${mine.id}/data`)
        const second = await call('GET', `/instances/${mine.id}/data`)

        expect(first.status).toBe(200)
        expect(first.body).toMatchObject({ ok: true, data: { city: 'Cached City' } })
        expect(typeof first.body.fetchedAt).toBe('string')
        expect(second.body).toEqual(first.body)
        expect(fetchCalls).toBe(1)
    })

    test('is 200 with { ok: false, code } when the widget fails', async () => {
        const mine = (await call('POST', '/instances', {
            body: { serviceId: 'weather', widgetId: 'forecast', params: { city: 'Limited' } },
        })).body

        const { status, body } = await call('GET', `/instances/${mine.id}/data`)

        expect(status).toBe(200)
        expect(body).toEqual({ ok: false, code: 'rate_limited' })
    })
})
