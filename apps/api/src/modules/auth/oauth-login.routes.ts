/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** log in with a provider (GitHub)
*/

// The routes (all under /api/auth/oauth, because app.ts adds /api):
//   GET /api/auth/oauth/:provider           → start: remember the flow in a cookie, go to the provider
//   GET /api/auth/oauth/:provider/callback  → the provider sends the user back here
//
// Like the OAuth routes in subscriptions.routes.ts, the browser NAVIGATES to
// these (window.location), so they answer redirects, never JSON. The one
// exception is the 404 for a provider that isn't configured: that only
// happens on a misconfigured deploy. No rate limit on purpose: a 429 JSON
// page in the middle of a login is a broken page, and a forged callback
// fails the state check before any request to the provider.

import { generateState } from 'arctic'
import { Elysia, t } from 'elysia'
import { env } from '../../config/env'
import { decrypt, encrypt } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import {
    loadUser,
    OAUTH_LOGIN_COOKIE,
    oauthLoginCookieOptions,
    SESSION_COOKIE,
    sessionCookieOptions,
} from '../../plugins/session'
import { describeOAuthError } from '../../services/oauth/errors'
import { isOAuthProviderId } from '../../services/oauth/ids'
import { getLoginProvider } from '../../services/oauth/providers'
import type { LoginProvider, ProviderIdentity } from '../../services/oauth/providers'
import { OAuthFlowError } from '../subscriptions/subscriptions.service'
import { authService } from './auth.routes'

// How long the user has on the provider's page. The cookie expires too, but that is up to the browser.
const LOGIN_FLOW_MAX_AGE_MS = 10 * 60 * 1000

// What the oauth_login cookie holds (encrypted) between the two routes.
// userId: who was logged in when the flow started (null = nobody), checked again at the callback.
interface PendingLogin {
    state: string
    userId: string | null
    createdAt: number
}

//the cookie comes from the browser: decrypt() fails on anything we didn't encrypt, and the shape is checked anyway
function readPendingLogin(value: unknown): PendingLogin | null {
    if (typeof value !== 'string' || value === '')
        return null
    try {
        const pending = JSON.parse(decrypt(value)) as Partial<PendingLogin>
        if (typeof pending.state !== 'string' || typeof pending.createdAt !== 'number')
            return null
        return {
            state: pending.state,
            userId: typeof pending.userId === 'string' ? pending.userId : null,
            createdAt: pending.createdAt,
        }
    } catch {
        return null
    }
}

//an unknown provider and one without env variables look the same from outside
function loginProviderOr404(id: string): LoginProvider {
    const provider = isOAuthProviderId(id) ? getLoginProvider(id) : null
    if (!provider)
        throw new AppError(404, 'NOT_FOUND', 'Route not found')
    return provider
}

// Anything that isn't an OAuthFlowError is a bug: log its name only (it could
// hold a code or a token) and show the user a generic error
function loginErrorUrl(error: unknown): string {
    let code = 'provider_error'
    if (error instanceof OAuthFlowError)
        code = error.code
    else
        console.error(`Unexpected error in the login callback: ${error instanceof Error ? error.name : typeof error}`)

    const url = new URL('/login', env.webUrl)
    url.searchParams.set('oauth_error', code)
    return url.toString()
}

const providerParams = t.Object({
    provider: t.String({ maxLength: 64, description: 'OAuth provider id', examples: ['github'] }),
})

// All optional: a missing one is an error we redirect for, not a 400 JSON page.
const callbackQuery = t.Object({
    code: t.Optional(t.String({ description: 'One-time code to trade for a token' })),
    state: t.Optional(t.String({ description: 'Must match the state stored in the oauth_login cookie' })),
    error: t.Optional(t.String({ description: 'Set when the user refused or the provider failed', examples: ['access_denied'] })),
})

export const oauthLoginRoutes = new Elysia({
    prefix: '/auth/oauth',
    detail: { tags: ['Auth'] },
})
    // GET /auth/oauth/:provider: start logging in. Remembers the flow in the
    // encrypted oauth_login cookie, then sends the browser to the provider.
    .get('/:provider', async ({ params, cookie, redirect }) => {
        const provider = loginProviderOr404(params.provider)
        const user = await loadUser(cookie[SESSION_COOKIE].value)

        const state = generateState()
        const pending: PendingLogin = { state, userId: user?.id ?? null, createdAt: Date.now() }
        cookie[OAUTH_LOGIN_COOKIE].set({ ...oauthLoginCookieOptions(), value: encrypt(JSON.stringify(pending)) })

        return redirect(provider.authorizationUrl(state).toString())
    }, {
        params: providerParams,
        detail: {
            summary: 'Start logging in with a provider (browser navigation)',
            description: 'Redirects to the provider\'s consent page. 404 when the provider is unknown or not configured on the server.',
        },
    })

    // GET /auth/oauth/:provider/callback: the provider sends the user back here.
    // The cookie is cleared first, whatever happens next: a flow can only be finished once.
    .get('/:provider/callback', async ({ params, query, cookie, request, server, redirect }) => {
        const provider = loginProviderOr404(params.provider)
        const pending = readPendingLogin(cookie[OAUTH_LOGIN_COOKIE].value)
        cookie[OAUTH_LOGIN_COOKIE].set({ ...oauthLoginCookieOptions(), value: '', maxAge: 0, expires: new Date(0) })

        try {
            // nothing from the query is trusted before the state matched
            if (!pending || !query.state || query.state !== pending.state)
                throw new OAuthFlowError('invalid_state')
            if (Date.now() - pending.createdAt > LOGIN_FLOW_MAX_AGE_MS)
                throw new OAuthFlowError('expired')
            if (query.error)
                throw new OAuthFlowError(query.error === 'access_denied' ? 'denied' : 'provider_error')

            // logged in or out as someone else (another tab) since the flow started
            const sessionUser = await loadUser(cookie[SESSION_COOKIE].value)
            if ((sessionUser?.id ?? null) !== pending.userId)
                throw new OAuthFlowError('session_mismatch')
            if (!query.code)
                throw new OAuthFlowError('provider_error')

            let identity: ProviderIdentity
            try {
                identity = await provider.identify(query.code)
            } catch (error) {
                //name and OAuth code only: the error may hold the provider's response
                console.error(`Logging in with ${provider.id} failed: ${describeOAuthError(error)}`)
                throw new OAuthFlowError('exchange_failed')
            }

            const { token, expiresAt } = await authService.loginWithProvider({
                provider: provider.id,
                identity,
                sessionUser,
                userAgent: request.headers.get('user-agent'),
                ip: server?.requestIP(request)?.address ?? null,
            })

            // same cookie as POST /api/auth/login
            cookie[SESSION_COOKIE].set({
                ...sessionCookieOptions(),
                value: token,
                expires: expiresAt,
            })

            return redirect(new URL('/dashboard', env.webUrl).toString())
        } catch (error) {
            return redirect(loginErrorUrl(error))
        }
    }, {
        params: providerParams,
        query: callbackQuery,
        detail: {
            summary: 'Login callback (called by the provider, not by clients)',
            description: 'Checks the state against the oauth_login cookie, asks the provider who the user is (the token is not stored), applies the linking rules and sets the session cookie. Redirects to WEB_URL/dashboard, or to WEB_URL/login?oauth_error=<code> with no session cookie.',
        },
    })
