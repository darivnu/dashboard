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

export const auth = new Elysia({ name: 'auth' })
    .macro({
        auth: {
            async resolve({ cookie }) {
                const user = await loadUser(cookie[SESSION_COOKIE].value)
                if (!user) {
                    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
                }
                return { user }
            },
        },
    })
