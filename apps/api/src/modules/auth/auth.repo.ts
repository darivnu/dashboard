import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { authIdentities, sessions, users, userTokens } from '../../db/schema'

export type User = typeof users.$inferSelect
export type UserToken = typeof userTokens.$inferSelect
export type TokenPurpose = UserToken['purpose']

export const authRepo = {
findUserByEmail(email: string): Promise<User | undefined> {
    return db.query.users.findFirst({
    where: eq(sql`lower(${users.email})`, email.toLowerCase()),
    })
},

/**
 * Returns undefined when the email is already taken (case-insensitive).
 * passwordHash is null and emailVerifiedAt set for an account created by logging in with a provider.
 */
async createUser(input: { email: string; passwordHash: string | null; emailVerifiedAt?: Date }): Promise<User | undefined> {
    const rows = await db
    .insert(users)
    .values({ email: input.email, passwordHash: input.passwordHash, emailVerifiedAt: input.emailVerifiedAt })
    .onConflictDoNothing()
    .returning()
    return rows[0]
},

/** The user this provider account logs in as, if it was linked to one.
 * Provider will always be github
*/
async findUserByIdentity(provider: string, providerUserId: string): Promise<User | undefined> {
    const rows = await db
    .select({ user: users })
    .from(authIdentities)
    .innerJoin(users, eq(users.id, authIdentities.userId))
    .where(and(eq(authIdentities.provider, provider), eq(authIdentities.providerUserId, providerUserId)))
    .limit(1)
    return rows[0]?.user
},

/** Does nothing when this provider account is already linked (to anyone): the unique index decides. */
async linkIdentity(input: {
    userId: string
    provider: string
    providerUserId: string
    email: string
}): Promise<void> {
    await db.insert(authIdentities).values(input).onConflictDoNothing()
},

async createUserToken(input: {
    userId: string
    purpose: TokenPurpose
    tokenHash: string
    expiresAt: Date
}): Promise<UserToken> {
    const rows = await db.insert(userTokens).values(input).returning()
    return rows[0]!
},

findValidUserToken(tokenHash: string, purpose: TokenPurpose): Promise<UserToken | undefined> {
    return db.query.userTokens.findFirst({
    where: and(
        eq(userTokens.tokenHash, tokenHash),
        eq(userTokens.purpose, purpose),
        isNull(userTokens.usedAt),
        gt(userTokens.expiresAt, new Date()),
    ),
    })
},

/**
 * Newest token of that purpose for the user, used or expired ones included.
 * Served by user_tokens_user_idx; the sort runs on the few rows it yields.
 */
findLatestUserToken(userId: string, purpose: TokenPurpose): Promise<UserToken | undefined> {
    return db.query.userTokens.findFirst({
    where: and(eq(userTokens.userId, userId), eq(userTokens.purpose, purpose)),
    orderBy: desc(userTokens.createdAt),
    })
},

/**
 * Marks the token used and the user verified in one transaction.
 * Returns false if the token was consumed by a concurrent request.
 */
consumeEmailVerification(tokenId: string, userId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
    const now = new Date()

    const consumed = await tx
        .update(userTokens)
        .set({ usedAt: now })
        .where(and(eq(userTokens.id, tokenId), isNull(userTokens.usedAt)))
        .returning({ id: userTokens.id })
    if (consumed.length === 0) return false

    await tx
        .update(users)
        .set({ emailVerifiedAt: now, updatedAt: now })
        .where(eq(users.id, userId))

    return true
    })
},

async createSession(input: {
    userId: string
    tokenHash: string
    expiresAt: Date
    userAgent: string | null
    ip: string | null
}): Promise<void> {
    await db.insert(sessions).values(input)
},

async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
},

/**
 * One statement: every table that points at users does so with ON DELETE
 * cascade (db/schema.ts), so Postgres removes the sessions, tokens,
 * identities, subscriptions and widget instances with the user, all or nothing.
 * Returns false when the user was already gone.
 */
async deleteUser(userId: string): Promise<boolean> {
    const rows = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id })
    return rows.length > 0
},
}

export type AuthRepo = typeof authRepo