import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { createFixedWindowLimiter } from '../../lib/rate-limit'
import { __resetRegistryForTests, registry } from '../../services/registry'
import { WidgetFetchError } from '../../services/types'
import type { ActionDef, FetchCtx, HttpClient, ServiceDef, WidgetParams } from '../../services/types'
import { createActionsService, RateLimitedError } from './actions.service'

const ALICE = 'user-alice'
const BOB = 'user-bob'

const fakeHttp: HttpClient = {
    json: async () => {
        throw new Error('these actions must not reach the network')
    },
}

// What run() was called with, in order.
let runs: { ctx: FetchCtx; params: WidgetParams }[] = []
let clock = 0
let actions: ReturnType<typeof createActionsService>

function action(overrides: Partial<ActionDef> = {}): ActionDef {
    return {
        id: 'star',
        name: 'Star',
        description: 'Stars a repository',
        params: [
            { name: 'repo', type: 'string', label: 'Repository', required: true },
            { name: 'times', type: 'integer', label: 'Times', default: 1, min: 1, max: 3 },
        ],
        run: async (ctx, params) => {
            runs.push({ ctx, params })
            return { starred: params.repo }
        },
        ...overrides,
    }
}

function service(overrides: Partial<ServiceDef> = {}): ServiceDef {
    return {
        id: 'hub',
        name: 'Hub',
        auth: { kind: 'none' },
        widgets: [],
        actions: [action()],
        ...overrides,
    }
}

beforeEach(() => {
    __resetRegistryForTests()
    runs = []
    clock = 0
    actions = createActionsService({ http: fakeHttp, limiter: createFixedWindowLimiter({ now: () => clock }) })
})

describe('runAction: lookup', () => {
    test('an unknown service is 404 NOT_FOUND', async () => {
        await expect(actions.runAction(ALICE, 'nope', 'star', {})).rejects.toMatchObject({
            status: 404,
            code: 'NOT_FOUND',
        })
    })

    test('an unknown action is 404 NOT_FOUND, also on a service without actions', async () => {
        registry.register(service())
        registry.register(service({ id: 'bare', actions: undefined }))

        await expect(actions.runAction(ALICE, 'hub', 'nope', {})).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
        await expect(actions.runAction(ALICE, 'bare', 'star', {})).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    })
})

describe('runAction: success', () => {
    test('runs the action with the http client and the validated params', async () => {
        registry.register(service())

        const result = await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun', times: '2', extra: 'dropped' })

        expect(result).toEqual({ ok: true, data: { starred: 'bun' } })
        expect(runs).toHaveLength(1)
        expect(runs[0]!.ctx).toEqual({ http: fakeHttp })
        // Defaults applied, numeric strings coerced, unknown keys dropped.
        expect(runs[0]!.params).toEqual({ repo: 'bun', times: 2 })
    })

    test('omitted params count as an empty object', async () => {
        registry.register(service({ actions: [action({ params: [] })] }))

        expect(await actions.runAction(ALICE, 'hub', 'star')).toEqual({ ok: true, data: { starred: undefined } })
        expect(runs[0]!.params).toEqual({})
    })

    test('a run() that returns nothing answers data: null', async () => {
        registry.register(service({ actions: [action({ run: async () => undefined })] }))

        expect(await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).toEqual({ ok: true, data: null })
    })

    test('nothing is cached: two identical calls both reach run()', async () => {
        registry.register(service())

        await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })
        await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })

        expect(runs).toHaveLength(2)
    })
})

describe('runAction: params', () => {
    test.each([
        ['a missing required param', {}],
        ['a param of the wrong type', { repo: 'bun', times: 'many' }],
        ['a param outside its bounds', { repo: 'bun', times: 9 }],
    ])('%s is 400 INVALID_PARAMS and run() is not called', async (_label, params) => {
        registry.register(service())

        await expect(actions.runAction(ALICE, 'hub', 'star', params)).rejects.toMatchObject({
            status: 400,
            code: 'INVALID_PARAMS',
        })
        expect(runs).toHaveLength(0)
    })
})

describe('runAction: params that are not an object', () => {
    // Only optional params, so nothing but the shape check can reject the call.
    const lenient = () => service({
        actions: [action({ params: [{ name: 'note', type: 'string', label: 'Note' }] })],
    })

    test.each([
        ['a string', 'hi'],
        ['an array', ['hi']],
        ['a number', 42],
        ['null', null],
        ['a boolean', true],
    ])('%s is 400 INVALID_PARAMS and run() is not called', async (_label, params) => {
        registry.register(lenient())

        await expect(actions.runAction(ALICE, 'hub', 'star', params)).rejects.toMatchObject({
            status: 400,
            code: 'INVALID_PARAMS',
            message: 'params must be an object',
        })
        expect(runs).toHaveLength(0)
    })

    test.each([
        ['a value that is neither a string nor a number', { note: true }],
        ['a nested object', { note: { deep: 'x' } }],
        ['a string longer than 500 characters', { note: 'x'.repeat(501) }],
        ['more than 50 keys', Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 'x']))],
    ])('%s is 400 INVALID_PARAMS and run() is not called', async (_label, params) => {
        registry.register(lenient())

        await expect(actions.runAction(ALICE, 'hub', 'star', params)).rejects.toMatchObject({
            status: 400,
            code: 'INVALID_PARAMS',
        })
        expect(runs).toHaveLength(0)
    })

    test('a 500-character string and 50 keys are accepted', async () => {
        registry.register(lenient())
        const params = Object.fromEntries(Array.from({ length: 49 }, (_, i) => [`k${i}`, i]))

        expect(await actions.runAction(ALICE, 'hub', 'star', { ...params, note: 'x'.repeat(500) })).toMatchObject({ ok: true })
    })

    test('an empty object still runs', async () => {
        registry.register(lenient())

        expect(await actions.runAction(ALICE, 'hub', 'star', {})).toMatchObject({ ok: true })
        expect(runs).toHaveLength(1)
    })
})

describe('runAction: auth kind', () => {
    test('an apiKey service answers needs_reauth without calling run()', async () => {
        registry.register(service({
            auth: { kind: 'apiKey', fields: [{ name: 'apiKey', type: 'string', label: 'API key', required: true }] },
        }))

        expect(await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).toEqual({ ok: false, code: 'needs_reauth' })
        expect(runs).toHaveLength(0)
    })

    test('an oauth2 service answers needs_reauth without calling run()', async () => {
        registry.register(service({ auth: { kind: 'oauth2', provider: 'github', scopes: [] } }))

        expect(await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).toEqual({ ok: false, code: 'needs_reauth' })
        expect(runs).toHaveLength(0)
    })

    test('params are validated before the auth kind is looked at', async () => {
        registry.register(service({
            auth: { kind: 'apiKey', fields: [{ name: 'apiKey', type: 'string', label: 'API key', required: true }] },
        }))

        await expect(actions.runAction(ALICE, 'hub', 'star', {})).rejects.toMatchObject({ status: 400, code: 'INVALID_PARAMS' })
    })
})

describe('runAction: errors thrown by run()', () => {
    function failingWith(error: unknown) {
        registry.register(service({
            actions: [action({ run: async () => { throw error } })],
        }))
    }

    test.each(['needs_reauth', 'rate_limited', 'upstream_error'] as const)('WidgetFetchError %s becomes { ok: false, code }', async (code) => {
        failingWith(new WidgetFetchError(code, 'boom'))

        expect(await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).toEqual({ ok: false, code })
    })

    test('WidgetFetchError invalid_config becomes 400 INVALID_PARAMS with its message', async () => {
        failingWith(new WidgetFetchError('invalid_config', 'repo does not exist'))

        await expect(actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).rejects.toMatchObject({
            status: 400,
            code: 'INVALID_PARAMS',
            message: 'repo does not exist',
        })
    })

    describe('any other exception', () => {
        let logged: ReturnType<typeof spyOn>

        beforeEach(() => {
            logged = spyOn(console, 'error').mockImplementation(() => {})
        })

        afterEach(() => {
            logged.mockRestore()
        })

        test('is logged and becomes upstream_error', async () => {
            failingWith(new TypeError('cannot read properties of undefined'))

            expect(await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).toEqual({ ok: false, code: 'upstream_error' })
            expect(logged).toHaveBeenCalledTimes(1)
        })
    })
})

describe('runAction: rate limit', () => {
    const limited = () => service({ actions: [action({ rateLimit: { max: 2, windowSeconds: 60 } })] })

    test('the call after max is a RateLimitedError (429 RATE_LIMITED) with the time left', async () => {
        registry.register(limited())
        await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })
        await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })

        clock = 20_000
        const call = actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })

        await expect(call).rejects.toBeInstanceOf(RateLimitedError)
        await expect(actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).rejects.toMatchObject({
            status: 429,
            code: 'RATE_LIMITED',
            retryAfterSeconds: 40,
        })
        expect(runs).toHaveLength(2)
    })

    test('the limit is lifted once the window has ended', async () => {
        registry.register(limited())
        await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })
        await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })

        clock = 60_000

        expect(await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).toMatchObject({ ok: true })
    })

    test('another user is not affected', async () => {
        registry.register(limited())
        await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })
        await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })
        await expect(actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).rejects.toBeInstanceOf(RateLimitedError)

        expect(await actions.runAction(BOB, 'hub', 'star', { repo: 'bun' })).toMatchObject({ ok: true })
    })

    test('each action and each service has its own count', async () => {
        const rateLimit = { max: 1, windowSeconds: 60 }
        registry.register(service({ actions: [action({ rateLimit }), action({ id: 'unstar', rateLimit })] }))
        registry.register(service({ id: 'lab', actions: [action({ rateLimit })] }))

        await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })

        expect(await actions.runAction(ALICE, 'hub', 'unstar', { repo: 'bun' })).toMatchObject({ ok: true })
        expect(await actions.runAction(ALICE, 'lab', 'star', { repo: 'bun' })).toMatchObject({ ok: true })
    })

    test('calls with invalid params count toward the limit', async () => {
        registry.register(limited())
        await expect(actions.runAction(ALICE, 'hub', 'star', {})).rejects.toMatchObject({ code: 'INVALID_PARAMS' })
        await expect(actions.runAction(ALICE, 'hub', 'star', {})).rejects.toMatchObject({ code: 'INVALID_PARAMS' })

        // Third call: limited before its (valid) params are even looked at.
        await expect(actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).rejects.toBeInstanceOf(RateLimitedError)
    })

    test('an unknown action does not count', async () => {
        registry.register(limited())
        for (let i = 0; i < 5; i += 1) {
            await expect(actions.runAction(ALICE, 'hub', 'nope', {})).rejects.toMatchObject({ status: 404 })
        }

        expect(await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).toMatchObject({ ok: true })
    })

    test('an action without rateLimit is never limited', async () => {
        registry.register(service())

        for (let i = 0; i < 50; i += 1) {
            expect(await actions.runAction(ALICE, 'hub', 'star', { repo: 'bun' })).toMatchObject({ ok: true })
        }
    })
})
