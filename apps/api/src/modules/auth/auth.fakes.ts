import type { Mail, Mailer } from '../../lib/mailer'
import type { AuthRepo, User, UserToken } from './auth.repo'

/** Test-only. A clock the tests move by hand, shared by the fake repo and the service. */
export function createClock(start: Date) {
    let current = start.getTime()
    return {
        now: () => new Date(current),
        advance(ms: number) {
            current += ms
        },
    }
}

/**
 * Test-only. In-memory stand-in for the Drizzle repo, with the same
 * case-insensitive email rule and one-shot token consumption.
 */
export function createFakeAuthRepo(now: () => Date = () => new Date()) {
    const users: User[] = []
    const tokens: UserToken[] = []
    const sessions: { tokenHash: string }[] = []

    const repo: AuthRepo = {
        async findUserByEmail(email) {
            return users.find((user) => user.email.toLowerCase() === email.toLowerCase())
        },

        async createUser(input) {
            if (users.some((user) => user.email.toLowerCase() === input.email.toLowerCase())) {
                return undefined
            }
            const user: User = {
                id: crypto.randomUUID(),
                email: input.email,
                passwordHash: input.passwordHash,
                emailVerifiedAt: null,
                role: 'user',
                disabledAt: null,
                createdAt: now(),
                updatedAt: now(),
            }
            users.push(user)
            return user
        },

        async createUserToken(input) {
            const token: UserToken = { id: crypto.randomUUID(), ...input, usedAt: null, createdAt: now() }
            tokens.push(token)
            return token
        },

        async findValidUserToken(tokenHash, purpose) {
            return tokens.find(
                (token) =>
                    token.tokenHash === tokenHash &&
                    token.purpose === purpose &&
                    token.usedAt === null &&
                    token.expiresAt > now(),
            )
        },

        async findLatestUserToken(userId, purpose) {
            return tokens
                .filter((token) => token.userId === userId && token.purpose === purpose)
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
        },

        async consumeEmailVerification(tokenId, userId) {
            const token = tokens.find((row) => row.id === tokenId && row.usedAt === null)
            if (!token) return false

            token.usedAt = now()
            const user = users.find((row) => row.id === userId)
            if (user) {
                user.emailVerifiedAt = now()
                user.updatedAt = now()
            }
            return true
        },

        async createSession(input) {
            sessions.push({ tokenHash: input.tokenHash })
        },

        async deleteSessionByTokenHash(tokenHash) {
            const index = sessions.findIndex((session) => session.tokenHash === tokenHash)
            if (index !== -1) sessions.splice(index, 1)
        },
    }

    return Object.assign(repo, { users, tokens, sessions })
}

/** Test-only. Records every mail; set `failure` to make the next sends throw. */
export function createFakeMailer() {
    const sent: Mail[] = []
    const mailer = {
        sent,
        failure: null as Error | null,
        async send(mail: Mail): Promise<void> {
            if (mailer.failure) throw mailer.failure
            sent.push(mail)
        },
    }
    return mailer satisfies Mailer
}
