import { beforeEach, describe, expect, test } from 'bun:test'
import { createTtlCache } from '../lib/cache'
import { AppError } from '../lib/errors'
import { createFakeRepo } from '../modules/dashboard/dashboard.fakes'
import { createDashboardService } from '../modules/dashboard/dashboard.service'
import { createDataService } from '../modules/dashboard/data.service'
import type { CachedWidgetData } from '../modules/dashboard/data.service'
import { createFakeSubscriptionsRepo } from '../modules/subscriptions/subscriptions.fakes'
import { registerServices } from './register'
import { __resetRegistryForTests } from './registry'
import type { HttpClient, WidgetFetchErrorCode } from './types'

// Exercises the mock services through the same two services the HTTP routes
// call (instance creation, then the data endpoint), with an in-memory repo.
// The route layer itself is covered by dashboard.routes.test.ts.

const ALICE = 'user-alice'

const fakeHttp: HttpClient = {
    json: async () => {
        throw new Error('the mock services must not reach the network')
    },
}

let dashboard: ReturnType<typeof createDashboardService>
let data: ReturnType<typeof createDataService>

beforeEach(() => {
    __resetRegistryForTests()
    registerServices('development')

    const repo = createFakeRepo()
    dashboard = createDashboardService(repo)
    data = createDataService({
        repo,
        subscriptions: createFakeSubscriptionsRepo(),
        http: fakeHttp,
        cache: createTtlCache<CachedWidgetData>(),
    })
})

async function createAndFetch(serviceId: string, widgetId: string, params: Record<string, unknown>) {
    const instance = await dashboard.create(ALICE, { serviceId, widgetId, params })
    return data.getInstanceData(ALICE, instance.id)
}

describe('mock / echo through the data endpoint', () => {
    test('returns ok: true with the params echoed back', async () => {
        const result = await createAndFetch('mock', 'echo', { message: 'hello', count: 3 })

        expect(result).toMatchObject({
            ok: true,
            data: { message: 'hello', count: 3, repeated: ['hello', 'hello', 'hello'] },
        })
        expect(result.ok && typeof (result.data as { timestamp: unknown }).timestamp).toBe('string')
        expect(result.ok && result.fetchedAt).toBeInstanceOf(Date)
    })

    test('count defaults to 1 and fail is optional', async () => {
        expect(await createAndFetch('mock', 'echo', { message: 'defaults' })).toMatchObject({
            ok: true,
            data: { message: 'defaults', count: 1, repeated: ['defaults'] },
        })
    })

    const codes: WidgetFetchErrorCode[] = ['needs_reauth', 'rate_limited', 'upstream_error', 'invalid_config']

    test.each(codes)('fail: %j is answered with { ok: false, code: %j }', async (code) => {
        expect(await createAndFetch('mock', 'echo', { message: 'x', fail: code })).toEqual({ ok: false, code })
    })

    test('an unrecognised fail value does not fail', async () => {
        expect(await createAndFetch('mock', 'echo', { message: 'typo', fail: 'rate_limted' })).toMatchObject({
            ok: true,
            data: { message: 'typo' },
        })
    })

    test('a missing message is rejected at creation, before any fetch', async () => {
        const attempt = dashboard.create(ALICE, { serviceId: 'mock', widgetId: 'echo', params: {} })

        await expect(attempt).rejects.toMatchObject({ status: 400, code: 'INVALID_PARAMS' })
    })
})

describe('mock_key / secret_echo', () => {
    test('is needs_reauth while no credential can reach fetch()', async () => {
        expect(await createAndFetch('mock_key', 'secret_echo', { message: 'secret' })).toEqual({
            ok: false,
            code: 'needs_reauth',
        })
    })
})

describe('in production', () => {
    test('neither mock service exists, so creating an instance is 400 UNKNOWN_WIDGET', async () => {
        __resetRegistryForTests()
        registerServices('production')

        for (const [serviceId, widgetId] of [['mock', 'echo'], ['mock_key', 'secret_echo']] as const) {
            const attempt = dashboard.create(ALICE, { serviceId, widgetId, params: { message: 'prod' } })

            await expect(attempt).rejects.toBeInstanceOf(AppError)
            await expect(attempt).rejects.toMatchObject({ status: 400, code: 'UNKNOWN_WIDGET' })
        }
    })
})
