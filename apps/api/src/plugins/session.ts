import { Elysia } from 'elysia'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '../db/client'
import { sessions, users } from '../db/schema'
import { hashToken } from '../lib/tokens'
import { AppError } from '../lib/errors'

export const SESSION_COOKIE = 'session'

export interface SessionUser {
    id: string
    email: string
    role: 'user' | 'admin'
    createdAt: Date
}

async function loadUser(token: unknown): Promise<SessionUser | null> {
    if (typeof token !== 'string' || token === '') return null
    
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
        if (!row || row.disabledAt) return null

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
