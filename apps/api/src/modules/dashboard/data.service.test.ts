import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { createTtlCache } from '../../lib/cache'
import { AppError } from '../../lib/errors'
import { __resetRegistryForTests, registry } from '../../services/registry'
import { WidgetFetchError } from '../../services/types'
import type { FetchCtx, HttpClient, ServiceAuth, WidgetParams } from '../../services/types'
import { createFakeRepo, fakeService, fakeWidget } from './dashboard.fakes'
import { createDataService } from './data.service'
import type { CachedWidgetData } from './data.service'

const ALICE = 'user-alice'
const BOB = 'user-bob'
const TTL_SECONDS = 300

const fakeHttp: HttpClient = {
    json: async () => {
        throw new Error('tests must not reach the network')
    },
}

let clock: { ms: number }
let repo: ReturnType<typeof createFakeRepo>
let service: ReturnType<typeof createDataService>
let fetchCalls: { ctx: FetchCtx; params: WidgetParams }[]
let fetchImpl: (params: WidgetParams) => Promise<unknown>

beforeEach(() => {
    clock = { ms: 0 }
    fetchCalls = []
    fetchImpl = async (params) => ({ city: params.city, call: fetchCalls.length })

    __resetRegistryForTests()
    registry.register(fakeService({
        widgets: [
            fakeWidget({
                refresh: { default: 3600, min: TTL_SECONDS },
                fetch: async (ctx, params) => {
                    fetchCalls.push({ ctx, params })
                    return fetchImpl(params)
                },
            }),
        ],
    }))

    repo = createFakeRepo()
    service = createDataService({
        repo,
        http: fakeHttp,
        cache: createTtlCache<CachedWidgetData>({ now: () => clock.ms }),
        now: () => new Date(clock.ms),
    })
})

function addInstance(params: WidgetParams, overrides: { userId?: string; serviceId?: string; widgetId?: string } = {}) {
    return repo.insert({
        userId: overrides.userId ?? ALICE,
        serviceId: overrides.serviceId ?? 'weather',
        widgetId: overrides.widgetId ?? 'forecast',
        title: null,
        params,
        refreshSeconds: 3600,
        x: 0,
        y: 0,
        w: 4,
        h: 3,
        enabled: true,
    })
}

describe('getInstanceData', () => {
    test('returns the widget data with the time it was fetched', async () => {
        const instance = await addInstance({ city: 'Paris', days: 3 })
        clock.ms = 5_000

        const result = await service.getInstanceData(ALICE, instance.id)

        expect(result).toEqual({ ok: true, data: { city: 'Paris', call: 1 }, fetchedAt: new Date(5_000) })
    })

    test('calls fetch with ctx = { http } and the validated params', async () => {
        const instance = await addInstance({ city: 'Paris', days: '3' as unknown as number, junk: 'x' })

        await service.getInstanceData(ALICE, instance.id)

        expect(fetchCalls).toHaveLength(1)
        expect(fetchCalls[0]!.ctx).toEqual({ http: fakeHttp })
        expect(fetchCalls[0]!.params).toEqual({ city: 'Paris', days: 3 })
    })

    test('two instances with different params get different data', async () => {
        const paris = await addInstance({ city: 'Paris', days: 3 })
        const rome = await addInstance({ city: 'Rome', days: 3 })

        const first = await service.getInstanceData(ALICE, paris.id)
        const second = await service.getInstanceData(ALICE, rome.id)

        expect(first).toMatchObject({ ok: true, data: { city: 'Paris' } })
        expect(second).toMatchObject({ ok: true, data: { city: 'Rome' } })
        expect(fetchCalls).toHaveLength(2)
    })
})

describe('caching', () => {
    test('a second request within the ttl does not call fetch and keeps the original fetchedAt', async () => {
        const instance = await addInstance({ city: 'Paris', days: 3 })

        clock.ms = 1_000
        const first = await service.getInstanceData(ALICE, instance.id)
        clock.ms = 200_000
        const second = await service.getInstanceData(ALICE, instance.id)

        expect(fetchCalls).toHaveLength(1)
        expect(second).toEqual(first)
        expect(second).toMatchObject({ fetchedAt: new Date(1_000) })
    })

    test('the same params in another key order share the cached result', async () => {
        const one = await addInstance({ city: 'Paris', days: 3 })
        const two = await addInstance({ days: 3, city: 'Paris' })

        const first = await service.getInstanceData(ALICE, one.id)
        const second = await service.getInstanceData(ALICE, two.id)

        expect(fetchCalls).toHaveLength(1)
        expect(second).toEqual(first)
    })

    test('fetches again once the ttl (refresh.min) has passed', async () => {
        const instance = await addInstance({ city: 'Paris', days: 3 })

        await service.getInstanceData(ALICE, instance.id)
        clock.ms = TTL_SECONDS * 1000
        const later = await service.getInstanceData(ALICE, instance.id)

        expect(fetchCalls).toHaveLength(2)
        expect(later).toMatchObject({ ok: true, fetchedAt: new Date(TTL_SECONDS * 1000) })
    })

    test('a failed fetch is not cached: the next request tries again', async () => {
        const instance = await addInstance({ city: 'Paris', days: 3 })

        fetchImpl = async () => {
            throw new WidgetFetchError('upstream_error', 'down')
        }
        const failed = await service.getInstanceData(ALICE, instance.id)

        fetchImpl = async () => ({ recovered: true })
        const retried = await service.getInstanceData(ALICE, instance.id)

        expect(failed).toEqual({ ok: false, code: 'upstream_error' })
        expect(retried).toMatchObject({ ok: true, data: { recovered: true } })
        expect(fetchCalls).toHaveLength(2)
    })
})

describe('error mapping', () => {
    let consoleError: ReturnType<typeof spyOn>

    beforeEach(() => {
        consoleError = spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleError.mockRestore()
    })

    test('a WidgetFetchError maps to its own code', async () => {
        const instance = await addInstance({ city: 'Paris', days: 3 })

        for (const code of ['needs_reauth', 'rate_limited', 'upstream_error', 'invalid_config'] as const) {
            fetchImpl = async () => {
                throw new WidgetFetchError(code, 'boom')
            }

            expect(await service.getInstanceData(ALICE, instance.id)).toEqual({ ok: false, code })
        }
        expect(consoleError).not.toHaveBeenCalled()
    })

    test('any other exception maps to upstream_error and is only logged on the server', async () => {
        const instance = await addInstance({ city: 'Paris', days: 3 })
        fetchImpl = async () => {
            throw new Error('secret internal detail')
        }

        const result = await service.getInstanceData(ALICE, instance.id)

        expect(result).toEqual({ ok: false, code: 'upstream_error' })
        expect(JSON.stringify(result)).not.toContain('secret')
        expect(consoleError).toHaveBeenCalledTimes(1)
    })

    test('an instance whose widget is no longer registered maps to invalid_config', async () => {
        const goneWidget = await addInstance({ city: 'Paris' }, { widgetId: 'removed' })
        const goneService = await addInstance({ city: 'Paris' }, { serviceId: 'removed' })

        expect(await service.getInstanceData(ALICE, goneWidget.id)).toEqual({ ok: false, code: 'invalid_config' })
        expect(await service.getInstanceData(ALICE, goneService.id)).toEqual({ ok: false, code: 'invalid_config' })
        expect(fetchCalls).toHaveLength(0)
    })

    test('stored params that no longer fit the definition map to invalid_config', async () => {
        const instance = await addInstance({ days: 3 })

        expect(await service.getInstanceData(ALICE, instance.id)).toEqual({ ok: false, code: 'invalid_config' })
        expect(fetchCalls).toHaveLength(0)
    })

    test('services that need credentials answer needs_reauth without calling fetch', async () => {
        const services: [string, ServiceAuth][] = [
            ['keyed', { kind: 'apiKey', fields: [] }],
            ['oauthed', { kind: 'oauth2', provider: 'github', scopes: [] }],
        ]

        for (const [id, auth] of services) {
            let called = false
            registry.register(fakeService({
                id,
                auth,
                widgets: [fakeWidget({ fetch: async () => { called = true } })],
            }))
            const instance = await addInstance({ city: 'Paris' }, { serviceId: id })

            expect(await service.getInstanceData(ALICE, instance.id)).toEqual({ ok: false, code: 'needs_reauth' })
            expect(called).toBe(false)
        }
    })
})

describe('ownership', () => {
    async function expectNotFound(promise: Promise<unknown>) {
        try {
            await promise
        } catch (error) {
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).status).toBe(404)
            return
        }
        throw new Error('expected a 404 AppError, but nothing was thrown')
    }

    test('another user\'s instance is a 404 and fetch is never called', async () => {
        const instance = await addInstance({ city: 'Paris', days: 3 }, { userId: ALICE })

        await expectNotFound(service.getInstanceData(BOB, instance.id))

        expect(fetchCalls).toHaveLength(0)
    })

    test('an id that does not exist is the same 404', async () => {
        await expectNotFound(service.getInstanceData(ALICE, crypto.randomUUID()))
    })
})
