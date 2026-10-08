import { Elysia } from 'elysia'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '../db/client'
import { sessions, users } from '../db/schema'
import { hashToken } from '../lib/tokens'
import { AppError } from '../lib/errors'
import { env } from '../config/env'

export const SESSION_COOKIE = 'session'

const isHttps = env.appUrl.startsWith('https://')

// SameSite=None (needed cross-site) only works paired with Secure, so this follows APP_URL's protocol rather than NODE_ENV.
export function sessionCookieOptions() {
    if (isHttps) {
        return { httpOnly: true, secure: true, sameSite: 'none', path: '/' } as const
    }
    return { httpOnly: true, secure: false, sameSite: 'lax', path: '/' } as const
}

export const OAUTH_PENDING_COOKIE = 'oauth_pending'
// Lifetime of an OAuth flow, from the click on Connect to the provider sending the user back.
export const OAUTH_PENDING_MAX_AGE_SECONDS = 600

// Holds the state of an OAuth flow in progress (see subscriptions.routes.ts). Lax, not None: the
// callback is a top-level navigation coming back from the provider, which Lax cookies are sent on.
// The path limits it to the subscriptions routes, the only ones that read it.
export function oauthPendingCookieOptions() {
    return {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/api/subscriptions',
        maxAge: OAUTH_PENDING_MAX_AGE_SECONDS,
    } as const
}

export const OAUTH_LOGIN_COOKIE = 'oauth_login'

// Same as oauth_pending, for logging in with a provider (see oauth-login.routes.ts).
// Its own name and path: the browser never sends oauth_pending to /api/auth.
export function oauthLoginCookieOptions() {
    return {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/api/auth/oauth',
        maxAge: OAUTH_PENDING_MAX_AGE_SECONDS,
    } as const
}

export interface SessionUser {
    id: string
    email: string
    role: 'user' | 'admin'
    createdAt: Date
}

// Exported for the routes that can't use the `auth` macro (the OAuth browser
// redirects, which must redirect instead of answering a JSON 401).
export async function loadUser(token: unknown): Promise<SessionUser | null> {
    if (typeof token !== 'string' || token === '')
        return null
    
    const rows = await db
        .select({
            id: users.id,
            email: users.email,
            role: users.role,
            createdAt: users.createdAt,
            disabledAt: users.disabledAt,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(
            eq(sessions.tokenHash, hashToken(token)),
            gt(sessions.expiresAt, new Date()),
        ))
        .limit(1)

        const row = rows[0]
        if (!row || row.disabledAt)
            return null

        const { disabledAt, ...user} = row
        return user
}

/** Users found by `transform`, waiting to be picked up by `resolve` of the same request. */
const authenticated = new WeakMap<Request, SessionUser>()

export const auth = new Elysia({ name: 'auth' })
    .macro({
        auth: {
            // `transform` runs before body/params validation, so a request
            // without a session gets 401 even when its body is invalid.
            async transform({ cookie, request }) {
                const user = await loadUser(cookie[SESSION_COOKIE].value)
                if (!user) {
                    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
                }
                authenticated.set(request, user)
            },
            // Only `resolve` can add a typed `user` to the handler's context.
            resolve({ request }) {
                return { user: authenticated.get(request)! }
            },
        },
    })
