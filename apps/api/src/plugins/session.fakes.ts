import { mock } from 'bun:test'

/**
 * Test-only. Importing this file replaces `db/client` with a stand-in that
 * answers the one query the auth macro runs:
 * db.select().from().innerJoin().where().limit(). The real macro still runs,
 * but needs neither Postgres nor DATABASE_URL.
 *
 * Any non-empty session cookie is accepted as `fakeSession.user`; set it to
 * null to simulate an unknown or expired token.
 *
 * Import it before the routes under test.
 */
export interface FakeSessionUser {
    id: string
    email: string
    role: 'user' | 'admin'
    createdAt: Date
    disabledAt: Date | null
}

export function fakeUser(id: string, email: string): FakeSessionUser {
    return { id, email, role: 'user', createdAt: new Date(0), disabledAt: null }
}

export const ALICE = fakeUser('00000000-0000-4000-8000-00000000000a', 'alice@example.com')
export const BOB = fakeUser('00000000-0000-4000-8000-00000000000b', 'bob@example.com')

export const fakeSession: { user: FakeSessionUser | null } = { user: ALICE }

export const loggedIn = { cookie: 'session=any-token' }

const sessionQuery = {
    from: () => sessionQuery,
    innerJoin: () => sessionQuery,
    where: () => sessionQuery,
    limit: async () => (fakeSession.user ? [fakeSession.user] : []),
}

mock.module('../db/client', () => ({
    db: { select: () => sessionQuery },
}))
