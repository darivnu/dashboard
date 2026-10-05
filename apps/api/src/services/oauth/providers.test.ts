import '../../config/env.fakes'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { OAuth2RequestError } from 'arctic'

// providers.ts reads env while loading; import it after the fake env is in place.
const { createGitHubProvider, describeOAuthError, getProvider, isPermanentOAuthError } = await import('./providers')

const config = { clientId: 'client-id', clientSecret: 'client-secret' }

// Replaces fetch for one test, so nothing ever reaches GitHub.
function stubFetch(body: unknown, status = 200) {
    return spyOn(globalThis, 'fetch').mockImplementation(
        (async () => new Response(body === null ? null : JSON.stringify(body), { status })) as unknown as typeof fetch,
    )
}

afterEach(() => {
    ;(globalThis.fetch as unknown as { mockRestore?: () => void }).mockRestore?.()
})

describe('getProvider', () => {
    test('returns null when the provider has no env variables', () => {
        expect(getProvider('github')).toBeNull()
    })
})

describe('GitHub adapter', () => {
    test('builds the authorization URL with state, scopes and the per-provider callback', () => {
        const url = createGitHubProvider(config).authorizationUrl('the-state', null, ['notifications'])

        expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize')
        expect(url.searchParams.get('state')).toBe('the-state')
        expect(url.searchParams.get('scope')).toBe('notifications')
        expect(url.searchParams.get('redirect_uri')).toBe(
            'http://localhost:8080/api/subscriptions/oauth/github/callback',
        )
    })

    test('normalises a non-expiring OAuth App token', async () => {
        stubFetch({ access_token: 'gho_abc', token_type: 'bearer', scope: 'notifications,repo' })

        const creds = await createGitHubProvider(config).exchangeCode('code', null)

        expect(creds).toEqual({
            accessToken: 'gho_abc',
            refreshToken: null,
            expiresAt: null,
            scopes: ['notifications', 'repo'],
        })
    })

    test('turns expires_in into an ISO expiresAt and keeps the refresh token', async () => {
        stubFetch({ access_token: 'ghu_abc', refresh_token: 'ghr_abc', expires_in: 3600, scope: '' })
        const before = Date.now()

        const creds = await createGitHubProvider(config).refresh!('ghr_old')

        expect(creds.refreshToken).toBe('ghr_abc')
        expect(creds.scopes).toEqual([])
        const expiresAt = Date.parse(creds.expiresAt!)
        expect(expiresAt).toBeGreaterThanOrEqual(before + 3600_000)
        expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3600_000)
    })

    test('surfaces GitHub error bodies as OAuth2RequestError', async () => {
        stubFetch({ error: 'bad_refresh_token', error_description: 'nope' })

        const error = await createGitHubProvider(config).refresh!('ghr_old').catch((e: unknown) => e)

        expect(error).toBeInstanceOf(OAuth2RequestError)
        expect(isPermanentOAuthError(error)).toBe(true)
    })

    test('rejects a token response without access_token, without echoing it', async () => {
        stubFetch({ token_type: 'bearer', refresh_token: 'ghr_secret' })

        const error = await createGitHubProvider(config).exchangeCode('code', null).catch((e: unknown) => e)

        expect(error).toBeInstanceOf(Error)
        expect(String((error as Error).message)).not.toContain('ghr_secret')
    })

    test('revoke sends DELETE with Basic auth and the token in the body', async () => {
        const fetchSpy = stubFetch(null, 204)

        await createGitHubProvider(config).revoke!('gho_abc')

        const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('https://api.github.com/applications/client-id/token')
        expect(init.method).toBe('DELETE')
        expect((init.headers as Record<string, string>).Authorization).toBe(
            `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
        )
        expect(JSON.parse(init.body as string)).toEqual({ access_token: 'gho_abc' })
    })

    test('revoke throws on anything but 204', async () => {
        stubFetch({ message: 'Not Found' }, 404)

        await expect(createGitHubProvider(config).revoke!('gho_abc')).rejects.toThrow(/status 404/)
    })
})

describe('isPermanentOAuthError / describeOAuthError', () => {
    test('only invalid_grant and bad_refresh_token are permanent', () => {
        expect(isPermanentOAuthError(new OAuth2RequestError('invalid_grant', null, null, null))).toBe(true)
        expect(isPermanentOAuthError(new OAuth2RequestError('temporarily_unavailable', null, null, null))).toBe(false)
        expect(isPermanentOAuthError(new Error('network'))).toBe(false)
    })

    test('describes errors by name and code only', () => {
        const error = new OAuth2RequestError('invalid_grant', 'token gho_secret is dead', null, null)

        expect(describeOAuthError(error)).toBe('OAuth2RequestError (invalid_grant)')
        expect(describeOAuthError(new TypeError('gho_secret'))).toBe('TypeError')
    })
})
