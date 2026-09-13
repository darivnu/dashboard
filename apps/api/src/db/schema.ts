  import {
    pgTable, pgEnum, uuid, text, timestamp,
    uniqueIndex, index,
  } from 'drizzle-orm/pg-core'
  import { sql } from 'drizzle-orm'

  const timestamps = {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }

  // ---------------------------------------------------------------------------
  // Enums
  // ---------------------------------------------------------------------------

  export const userRole = pgEnum('user_role', ['user', 'admin'])
  export const tokenPurpose = pgEnum('token_purpose', ['email_verification', 'password_reset'])

  // ---------------------------------------------------------------------------
  // Users & authentication (who you are)
  // ---------------------------------------------------------------------------

  export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),                 // null for OIDC-only accounts
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    role: userRole('role').notNull().default('user'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }), // admin can suspend
    ...timestamps,
  }, (t) => [
    uniqueIndex('users_email_idx').on(sql`lower(${t.email})`),
  ])

  /** One-time tokens: email verification, password reset. Store the hash, never the token. */
  export const userTokens = pgTable('user_tokens', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    purpose: tokenPurpose('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  }, (t) => [
    uniqueIndex('user_tokens_hash_idx').on(t.tokenHash),
    index('user_tokens_user_idx').on(t.userId, t.purpose),
  ])

  /** Server-side sessions. Cookie holds the raw token; DB holds its hash. */
  export const sessions = pgTable('sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamps.createdAt,
  }, (t) => [
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ])
