/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** providers
*/

import { GitHub, Spotify } from 'arctic'
import { env, type OAuthClientConfig } from '../../config/env'
import type { OAuthCredentials } from '../types'
import type { OAuthProviderId } from './ids'

const REVOKE_TIMEOUT_MS = 10_000
const GITHUB_API_TIMEOUT_MS = 10_000

/**
 * What the rest of the API needs from an OAuth provider. One adapter per
 * provider hides the library (arctic) and the provider's quirks, and always
 * hands back tokens in the same `OAuthCredentials` shape.
 */
export interface OAuthProvider {
    id: OAuthProviderId
    /** Whether the flow uses PKCE. When false, `codeVerifier` is always null. */
    //PKCE is a security measure that prevents authorization code interception attacks. It is used in public clien
    //PKCE stands for Proof Key for Code Exchange.
    pkce: boolean
    authorizationUrl(state: string, codeVerifier: string | null, scopes: string[]): URL
    exchangeCode(code: string, codeVerifier: string | null): Promise<OAuthCredentials>
    /** The result may come back with `refreshToken: null`: the caller then keeps the old one. */
    refresh?(refreshToken: string): Promise<OAuthCredentials>
    /** Ends the user's authorization at the provider, so that connecting again asks for consent. */
    revoke?(accessToken: string): Promise<void>
}

//the redirect URI is per provider, not per service: providers want it registered in advance
//and a GitHub OAuth App only accepts one. The service id travels in the pending cookie instead
export function callbackUrl(id: OAuthProviderId): string {
    return `${env.appUrl}/api/subscriptions/oauth/${id}/callback`
}

//arctic's getters (tokens.refreshToken(), ...) throw when a field is missing, so we read the raw data
//the error messages never include the data itself: it holds the tokens
function toCredentials(data: object, now: Date, splitScope: (raw: string) => string[]): OAuthCredentials {
    const raw = data as Record<string, unknown>

    if (typeof raw.access_token !== 'string' || raw.access_token === '') {
        throw new Error('Token response has no access_token')
    }

    const expiresIn = typeof raw.expires_in === 'number' ? raw.expires_in : null
    return {
        accessToken: raw.access_token,
        refreshToken: typeof raw.refresh_token === 'string' && raw.refresh_token !== '' ? raw.refresh_token : null,
        expiresAt: expiresIn === null ? null : new Date(now.getTime() + expiresIn * 1000).toISOString(),
        scopes: typeof raw.scope === 'string' ? splitScope(raw.scope) : [],
    }
}

//GitHub answers with a comma-separated scope list ("notifications,repo"), not a space-separated one
function splitGitHubScope(raw: string): string[] {
    return raw.split(',').map((scope) => scope.trim()).filter((scope) => scope.length > 0)
}

//exported for the tests only; everything else goes through getProvider()
export function createGitHubProvider(config: OAuthClientConfig): OAuthProvider {
    const client = new GitHub(config.clientId, config.clientSecret, callbackUrl('github'))

    return {
        id: 'github',
        //arctic's GitHub client takes no code verifier, so no PKCE for this one
        pkce: false,

        authorizationUrl(state, _codeVerifier, scopes) {
            return client.createAuthorizationURL(state, scopes)
        },

        async exchangeCode(code) {
            const tokens = await client.validateAuthorizationCode(code)
            return toCredentials(tokens.data, new Date(), splitGitHubScope)
        },

        //only GitHub Apps with expiring tokens send a refresh token; OAuth App tokens never expire
        async refresh(refreshToken) {
            const tokens = await client.refreshAccessToken(refreshToken)
            return toCredentials(tokens.data, new Date(), splitGitHubScope)
        },

        //https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-authorization
        //the grant and not only the token (/token): with the grant left in place GitHub skips its consent page
        //on the next connect. It takes every token this GitHub account has for this OAuth app with it
        async revoke(accessToken) {
            const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
            const response = await fetch(`https://api.github.com/applications/${config.clientId}/grant`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Basic ${basic}`,
                    Accept: 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
                body: JSON.stringify({ access_token: accessToken }),
                signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
            })
            if (response.status !== 204) {
                throw new Error(`GitHub authorization revocation failed with status ${response.status}`)
            }
        },
    }
}

//Spotify follows the OAuth standard: scopes separated by spaces ("user-read-recently-played user-top-read")
function splitSpaceScope(raw: string): string[] {
    return raw.split(' ').filter((scope) => scope.length > 0)
}

//exported for the tests only; everything else goes through getProvider()
export function createSpotifyProvider(config: OAuthClientConfig): OAuthProvider {
    const client = new Spotify(config.clientId, config.clientSecret, callbackUrl('spotify'))

    return {
        id: 'spotify',
        //arctic's Spotify client takes a code verifier: the routes generate it and hand it back at the callback
        pkce: true,

        authorizationUrl(state, codeVerifier, scopes) {
            return client.createAuthorizationURL(state, codeVerifier, scopes)
        },

        async exchangeCode(code, codeVerifier) {
            const tokens = await client.validateAuthorizationCode(code, codeVerifier)
            return toCredentials(tokens.data, new Date(), splitSpaceScope)
        },

        //Spotify tokens last one hour. The answer usually has no new refresh token: the token manager keeps the old one
        async refresh(refreshToken) {
            const tokens = await client.refreshAccessToken(refreshToken)
            return toCredentials(tokens.data, new Date(), splitSpaceScope)
        },

        //no revoke: Spotify has no revocation endpoint. The user removes the app at https://www.spotify.com/account/apps/
    }
}

const factories: Record<OAuthProviderId, () => OAuthProvider | null> = {
    github: () => (env.oauth.github ? createGitHubProvider(env.oauth.github) : null),
    spotify: () => (env.oauth.spotify ? createSpotifyProvider(env.oauth.spotify) : null),
}

const instances = new Map<OAuthProviderId, OAuthProvider | null>()
const testOverrides = new Map<OAuthProviderId, OAuthProvider | null>()

/** The adapter for `id`, or null when its env variables are not set. */
export function getProvider(id: OAuthProviderId): OAuthProvider | null {
    if (testOverrides.has(id))
        return testOverrides.get(id) ?? null
    if (!instances.has(id)) {
        instances.set(id, factories[id]())
    }
    return instances.get(id) ?? null
}

/**
 * Test-only. Makes getProvider(id) return `provider` (a fake, or null for
 * "not configured"); `undefined` removes the override. Same idea as
 * __resetRegistryForTests: tests set this instead of mocking the module,
 * because a module mock would leak into every other test file of the run.
 */
export function __setProviderForTests(id: OAuthProviderId, provider: OAuthProvider | null | undefined): void {
    if (provider === undefined)
        testOverrides.delete(id)
    else
        testOverrides.set(id, provider)
}

// ---------------------------------------------------------------------------
// Logging in with a provider
// ---------------------------------------------------------------------------

/** Who the user is at the provider. */
export interface ProviderIdentity {
    /** The provider's stable user id (GitHub's numeric id, as text). */
    providerUserId: string
    /** The primary email, only when the provider says it is verified; null otherwise. */
    email: string | null
}

/**
 * Logging in with a provider, as opposed to connecting a service: the token
 * is only used to ask who the user is, then dropped. It never leaves the
 * adapter, so it can't end up stored or logged.
 */
export interface LoginProvider {
    id: OAuthProviderId
    authorizationUrl(state: string): URL
    /** Trades the code for a token, asks who the user is, and forgets the token. */
    identify(code: string): Promise<ProviderIdentity>
}

//its own callback, apart from the subscriptions one. The GitHub OAuth App's callback URL must be
//${APP_URL}/api so that both are subdirectories of it (GitHub's rule for redirect_uri)
export function loginCallbackUrl(id: OAuthProviderId): string {
    return `${env.appUrl}/api/auth/oauth/${id}/callback`
}

//GET on the GitHub API with the user's token. The error holds the status only, never the body
async function githubGet(path: string, accessToken: string): Promise<unknown> {
    const response = await fetch(`https://api.github.com${path}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    })
    if (response.status !== 200) {
        throw new Error(`GitHub ${path} answered with status ${response.status}`)
    }
    return response.json()
}

export function createGitHubLoginProvider(config: OAuthClientConfig): LoginProvider {
    //a second arctic client: the redirect URI is fixed at construction and sent again with the code
    const client = new GitHub(config.clientId, config.clientSecret, loginCallbackUrl('github'))

    return {
        id: 'github',

        //user:email is what /user/emails needs; /user itself needs no scope
        authorizationUrl(state) {
            return client.createAuthorizationURL(state, ['user:email'])
        },

        async identify(code) {
            const tokens = await client.validateAuthorizationCode(code)
            const accessToken = (tokens.data as Record<string, unknown>).access_token
            if (typeof accessToken !== 'string' || accessToken === '') {
                throw new Error('Token response has no access_token')
            }

            const user = await githubGet('/user', accessToken) as { id?: unknown }
            if (typeof user.id !== 'number') {
                throw new Error('GitHub /user has no id')
            }

            //only the primary address, and only if GitHub verified it: one deterministic email
            const emails = await githubGet('/user/emails', accessToken) as { email: string; primary: boolean; verified: boolean }[]
            const primary = Array.isArray(emails) ? emails.find((entry) => entry.primary) : undefined

            return {
                providerUserId: String(user.id),
                email: primary?.verified ? primary.email : null, //if not verified, then null
            }
        },
    }
}

const loginFactories: Record<OAuthProviderId, () => LoginProvider | null> = {
    github: () => (env.oauth.github ? createGitHubLoginProvider(env.oauth.github) : null),
    //Spotify only connects a service, nobody logs in with it
    spotify: () => null,
}

const loginInstances = new Map<OAuthProviderId, LoginProvider | null>()

/** The login adapter for `id`, or null when its env variables are not set. */
export function getLoginProvider(id: OAuthProviderId): LoginProvider | null {
    if (!loginInstances.has(id)) {
        loginInstances.set(id, loginFactories[id]())
    }
    return loginInstances.get(id) ?? null
}
