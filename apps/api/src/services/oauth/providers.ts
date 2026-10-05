/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** providers
*/

import { GitHub } from 'arctic'
import { env, type OAuthClientConfig } from '../../config/env'
import type { OAuthCredentials } from '../types'
import type { OAuthProviderId } from './ids'

const REVOKE_TIMEOUT_MS = 10_000

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

        //https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token
        async revoke(accessToken) {
            const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
            const response = await fetch(`https://api.github.com/applications/${config.clientId}/token`, {
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
                throw new Error(`GitHub token revocation failed with status ${response.status}`)
            }
        },
    }
}

const factories: Record<OAuthProviderId, () => OAuthProvider | null> = {
    github: () => (env.oauth.github ? createGitHubProvider(env.oauth.github) : null),
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
