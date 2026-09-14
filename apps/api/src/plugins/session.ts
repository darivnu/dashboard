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
