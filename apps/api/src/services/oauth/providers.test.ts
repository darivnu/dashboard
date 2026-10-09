import '../../config/env.fakes'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { OAuth2RequestError } from 'arctic'
import { describeOAuthError, isPermanentOAuthError } from './errors'

// providers.ts reads env while loading; import it after the fake env is in place.
const { createGitHubProvider, createSpotifyProvider, getProvider } = await import('./providers')

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
        expect(getProvider('spotify')).toBeNull()
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

    //the grant, not only the token: with the grant left in place GitHub skips its consent page on the next connect
    test('revoke deletes the whole authorization: DELETE on /grant with Basic auth and the token in the body', async () => {
        const fetchSpy = stubFetch(null, 204)

        await createGitHubProvider(config).revoke!('gho_abc')

        const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('https://api.github.com/applications/client-id/grant')
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

describe('Spotify adapter', () => {
    test('uses PKCE', () => {
        const provider = createSpotifyProvider(config)

        expect(provider.id).toBe('spotify')
        expect(provider.pkce).toBe(true)
    })

    test('builds the authorization URL with state, space-separated scopes, the per-provider callback and a PKCE challenge', () => {
        const url = createSpotifyProvider(config).authorizationUrl('the-state', 'the-code-verifier', [
            'user-read-recently-played',
            'user-top-read',
        ])

        expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
        expect(url.searchParams.get('state')).toBe('the-state')
        expect(url.searchParams.get('scope')).toBe('user-read-recently-played user-top-read')
        expect(url.searchParams.get('redirect_uri')).toBe(
            'http://localhost:8080/api/subscriptions/oauth/spotify/callback',
        )
        //the challenge is a hash of the verifier: the verifier itself must not travel in the URL
        expect(url.searchParams.get('code_challenge')).toBeTruthy()
        expect(url.searchParams.get('code_challenge')).not.toBe('the-code-verifier')
        expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    })

    test('exchangeCode sends the code verifier to the token endpoint', async () => {
        const fetchSpy = stubFetch({ access_token: 'BQD_abc', token_type: 'Bearer', expires_in: 3600 })

        await createSpotifyProvider(config).exchangeCode('the-code', 'the-code-verifier')

        const request = fetchSpy.mock.calls[0]![0] as unknown as Request
        expect(request.url).toBe('https://accounts.spotify.com/api/token')
        const form = new URLSearchParams(await request.text())
        expect(form.get('code')).toBe('the-code')
        expect(form.get('code_verifier')).toBe('the-code-verifier')
    })

    test('exchangeCode turns expires_in into an ISO expiresAt, keeps the refresh token and splits scope on spaces', async () => {
        stubFetch({
            access_token: 'BQD_abc',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'AQC_abc',
            scope: 'user-read-recently-played user-top-read',
        })
        const before = Date.now()

        const creds = await createSpotifyProvider(config).exchangeCode('code', 'the-code-verifier')

        expect(creds.accessToken).toBe('BQD_abc')
        expect(creds.refreshToken).toBe('AQC_abc')
        expect(creds.scopes).toEqual(['user-read-recently-played', 'user-top-read'])
        const expiresAt = Date.parse(creds.expiresAt!)
        expect(expiresAt).toBeGreaterThanOrEqual(before + 3600_000)
        expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3600_000)
    })

    //Spotify usually refreshes without sending a new refresh token: the token manager then keeps the old one
    test('refresh returns refreshToken: null when Spotify sends none', async () => {
        const fetchSpy = stubFetch({
            access_token: 'BQD_new',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'user-read-recently-played',
        })

        const creds = await createSpotifyProvider(config).refresh!('AQC_old')

        expect(creds.accessToken).toBe('BQD_new')
        expect(creds.refreshToken).toBeNull()
        expect(creds.scopes).toEqual(['user-read-recently-played'])
        const form = new URLSearchParams(await (fetchSpy.mock.calls[0]![0] as unknown as Request).text())
        expect(form.get('grant_type')).toBe('refresh_token')
        expect(form.get('refresh_token')).toBe('AQC_old')
    })

    test('surfaces Spotify error bodies as OAuth2RequestError', async () => {
        stubFetch({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400)

        const error = await createSpotifyProvider(config).refresh!('AQC_old').catch((e: unknown) => e)

        expect(error).toBeInstanceOf(OAuth2RequestError)
        expect(isPermanentOAuthError(error)).toBe(true)
    })

    test('rejects a token response without access_token, without echoing it', async () => {
        stubFetch({ token_type: 'Bearer', refresh_token: 'AQC_secret' })

        const error = await createSpotifyProvider(config).exchangeCode('code', 'the-code-verifier').catch((e: unknown) => e)

        expect(error).toBeInstanceOf(Error)
        expect(String((error as Error).message)).not.toContain('AQC_secret')
    })

    //Spotify has no revocation endpoint: disconnecting only deletes the stored tokens
    test('has no revoke', () => {
        expect(createSpotifyProvider(config).revoke).toBeUndefined()
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
