import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { OAuth2RequestError } from 'arctic'
import { createFakeSubscriptionsRepo } from '../../modules/subscriptions/subscriptions.fakes'
import type { ServiceSubscriptionInstance } from '../../modules/subscriptions/subscriptions.repo'
import { WidgetFetchError } from '../types'
import type { OAuthCredentials } from '../types'
import { createFakeProvider, fakeCredentials } from './providers.fakes'
import type { FakeOAuthProvider } from './providers.fakes'
import { createTokenManager } from './tokens'

const ALICE = 'user-alice'
const NOW = new Date('2026-01-01T12:00:00Z')

function inSeconds(seconds: number): string {
    return new Date(NOW.getTime() + seconds * 1000).toISOString()
}

let repo: ReturnType<typeof createFakeSubscriptionsRepo>
let provider: FakeOAuthProvider
let manager: ReturnType<typeof createTokenManager>
let errorSpy: ReturnType<typeof spyOn>

function newManager() {
    return createTokenManager({ repo, getProvider: () => provider, now: () => NOW })
}

beforeEach(() => {
    repo = createFakeSubscriptionsRepo()
    provider = createFakeProvider()
    manager = newManager()
    errorSpy = spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    errorSpy.mockRestore()
})

// Returns a copy, like a row read from the database before the request started.
async function subscribe(creds: Partial<OAuthCredentials>): Promise<ServiceSubscriptionInstance> {
    const row = await repo.upsert(ALICE, 'github', { ...fakeCredentials(creds) })
    return { ...row }
}

const expiring = {
    accessToken: 'old-access-token',
    refreshToken: 'old-refresh-token',
    expiresAt: inSeconds(30),
}

describe('getAccessToken', () => {
    test('returns a token that never expires without refreshing', async () => {
        const sub = await subscribe({ accessToken: 'forever', expiresAt: null })

        expect(await manager.getAccessToken(sub, 'github')).toBe('forever')
        expect(provider.calls.refresh).toHaveLength(0)
    })

    test('returns a token valid for more than a minute without refreshing', async () => {
        const sub = await subscribe({ accessToken: 'fresh', refreshToken: 'r', expiresAt: inSeconds(120) })

        expect(await manager.getAccessToken(sub, 'github')).toBe('fresh')
        expect(provider.calls.refresh).toHaveLength(0)
    })

    test('refreshes an expiring token and saves the new credentials', async () => {
        const sub = await subscribe(expiring)
        provider.refreshResult = fakeCredentials({
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
            expiresAt: inSeconds(3600),
        })

        expect(await manager.getAccessToken(sub, 'github')).toBe('new-access-token')
        expect(provider.calls.refresh).toEqual(['old-refresh-token'])
        expect(repo.rows[0]!.credentials).toMatchObject({
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
        })
    })

    test('5 concurrent calls share a single refresh', async () => {
        const sub = await subscribe(expiring)
        provider.refreshDelayMs = 20

        const tokens = await Promise.all(Array.from({ length: 5 }, () => manager.getAccessToken(sub, 'github')))

        expect(tokens).toEqual(Array(5).fill('refreshed-access-token'))
        expect(provider.calls.refresh).toHaveLength(1)
    })

    test('two server instances refresh only once thanks to the row lock', async () => {
        const sub = await subscribe(expiring)
        provider.refreshResult = fakeCredentials({ accessToken: 'new-access-token', expiresAt: inSeconds(3600) })
        provider.refreshDelayMs = 20
        const otherInstance = newManager()

        const tokens = await Promise.all([
            manager.getAccessToken(sub, 'github'),
            otherInstance.getAccessToken(sub, 'github'),
        ])

        expect(tokens).toEqual(['new-access-token', 'new-access-token'])
        expect(provider.calls.refresh).toHaveLength(1)
    })

    test('uses the stored token when another instance already refreshed it', async () => {
        const stale = await subscribe(expiring)
        Object.assign(repo.rows[0]!, {
            credentials: fakeCredentials({ accessToken: 'already-new', expiresAt: inSeconds(3600) }),
        })

        expect(await manager.getAccessToken(stale, 'github')).toBe('already-new')
        expect(provider.calls.refresh).toHaveLength(0)
    })

    test('keeps the old refresh token when the provider sends none', async () => {
        const sub = await subscribe(expiring)
        provider.refreshResult = fakeCredentials({ accessToken: 'new', refreshToken: null, expiresAt: inSeconds(3600) })

        await manager.getAccessToken(sub, 'github')

        expect(repo.rows[0]!.credentials).toMatchObject({ refreshToken: 'old-refresh-token' })
    })

    test('an expired token without a refresh token needs reauth', async () => {
        const sub = await subscribe({ ...expiring, refreshToken: null })

        const error = await manager.getAccessToken(sub, 'github').catch((e: unknown) => e)

        expect(error).toBeInstanceOf(WidgetFetchError)
        expect((error as WidgetFetchError).code).toBe('needs_reauth')
        expect(provider.calls.refresh).toHaveLength(0)
    })

    test('a rejected refresh token (invalid_grant) needs reauth', async () => {
        const sub = await subscribe(expiring)
        provider.refreshError = new OAuth2RequestError('invalid_grant', null, null, null)

        const error = await manager.getAccessToken(sub, 'github').catch((e: unknown) => e)

        expect((error as WidgetFetchError).code).toBe('needs_reauth')
    })

    test('a network failure is an upstream_error and leaves the credentials alone', async () => {
        const sub = await subscribe(expiring)
        provider.refreshError = new TypeError('fetch failed')

        const error = await manager.getAccessToken(sub, 'github').catch((e: unknown) => e)

        expect((error as WidgetFetchError).code).toBe('upstream_error')
        expect(repo.rows[0]!.credentials).toMatchObject({ accessToken: 'old-access-token' })
    })

    test('an unconfigured provider is an upstream_error', async () => {
        const sub = await subscribe(expiring)
        manager = createTokenManager({ repo, getProvider: () => null, now: () => NOW })

        const error = await manager.getAccessToken(sub, 'github').catch((e: unknown) => e)

        expect((error as WidgetFetchError).code).toBe('upstream_error')
    })

    test('a failed refresh can be retried by the next call', async () => {
        const sub = await subscribe(expiring)
        provider.refreshError = new TypeError('fetch failed')
        await manager.getAccessToken(sub, 'github').catch(() => {})
        provider.refreshError = null

        expect(await manager.getAccessToken(sub, 'github')).toBe('refreshed-access-token')
        expect(provider.calls.refresh).toHaveLength(2)
    })

    test('never logs a token', async () => {
        const sub = await subscribe({ ...expiring, accessToken: 'secret-access', refreshToken: 'secret-refresh' })
        provider.refreshError = new OAuth2RequestError('server_error', 'secret-refresh is weird', null, null)

        await manager.getAccessToken(sub, 'github').catch(() => {})

        expect(errorSpy).toHaveBeenCalled()
        const logged = JSON.stringify(errorSpy.mock.calls)
        expect(logged).not.toContain('secret-access')
        expect(logged).not.toContain('secret-refresh')
    })
})
