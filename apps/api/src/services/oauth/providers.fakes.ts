/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** fake OAuth provider for the tests
*/

import type { OAuthCredentials } from '../types'
import type { OAuthProvider } from './providers'

/**
 * Test-only. An OAuth provider that never touches the network.
 *
 * Every call is counted (and its arguments kept) in `calls`, so a test can
 * check e.g. that 5 concurrent widget fetches caused exactly 1 refresh.
 * `refreshResult` / `refreshError` (and the same for exchange and revoke)
 * decide what the next calls do; tests change them freely.
 */
export interface FakeOAuthProvider extends OAuthProvider {
    calls: {
        exchange: string[]
        refresh: string[]
        revoke: string[]
    }
    exchangeResult: OAuthCredentials
    exchangeError: unknown
    refreshResult: OAuthCredentials
    refreshError: unknown
    revokeError: unknown
    /** Lets a test hold refresh() open, to overlap concurrent calls. */
    refreshDelayMs: number
}

export function fakeCredentials(overrides: Partial<OAuthCredentials> = {}): OAuthCredentials {
    return {
        accessToken: 'fake-access-token',
        refreshToken: null,
        expiresAt: null,
        scopes: [],
        ...overrides,
    }
}

export function createFakeProvider(overrides: Partial<FakeOAuthProvider> = {}): FakeOAuthProvider {
    const provider: FakeOAuthProvider = {
        id: 'github',
        pkce: false,
        calls: { exchange: [], refresh: [], revoke: [] },
        exchangeResult: fakeCredentials({ accessToken: 'exchanged-access-token' }),
        exchangeError: null,
        refreshResult: fakeCredentials({ accessToken: 'refreshed-access-token' }),
        refreshError: null,
        revokeError: null,
        refreshDelayMs: 0,

        authorizationUrl(state, _codeVerifier, scopes) {
            const url = new URL('https://provider.test/authorize')
            url.searchParams.set('state', state)
            url.searchParams.set('scope', scopes.join(' '))
            return url
        },

        async exchangeCode(code) {
            provider.calls.exchange.push(code)
            if (provider.exchangeError)
                throw provider.exchangeError
            return provider.exchangeResult
        },

        async refresh(refreshToken) {
            provider.calls.refresh.push(refreshToken)
            if (provider.refreshDelayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, provider.refreshDelayMs))
            }
            if (provider.refreshError)
                throw provider.refreshError
            return provider.refreshResult
        },

        async revoke(accessToken) {
            provider.calls.revoke.push(accessToken)
            if (provider.revokeError)
                throw provider.revokeError
        },

        ...overrides,
    }
    return provider
}
