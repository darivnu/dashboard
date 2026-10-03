import {
    pgTable, pgEnum, uuid, text, integer, timestamp, jsonb, boolean,
    uniqueIndex, index, check,
  } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { encryptedJson } from './encrypted'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum('user_role', ['user', 'admin'])
export const tokenPurpose = pgEnum('token_purpose', ['email_verification', 'password_reset'])
export const subscriptionStatus = pgEnum('subscription_status', ['active', 'needs_reauth', 'revoked'])

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

// ---------------------------------------------------------------------------
// Service subscriptions (what you can do)
// ---------------------------------------------------------------------------

export const serviceSubscriptions = pgTable('service_subscriptions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    serviceId: text('service_id').notNull(), //a registeryid like in the widget registry
    status: subscriptionStatus('status').notNull().default('active'),
    credentials: encryptedJson<Record<string, unknown>>('credentials').notNull(), //encrypted json object with the credentials for the service
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
}, (t) => [
    uniqueIndex('service_subscriptions_user_service_idx').on(t.userId, t.serviceId), //ensures that a user cannot have same service twice
])

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** One widget placed on one user's dashboard. Definitions live in the registry, data in the cache. */
export const widgetInstances = pgTable('widget_instances', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    serviceId: text('service_id').notNull(),              // registry ids, validated together
    widgetId: text('widget_id').notNull(),
    title: text('title'),                                 // optional user override
    params: jsonb('params').$type<Record<string, string | number>>().notNull(),
    refreshSeconds: integer('refresh_seconds').notNull(),

    // grid layout (react-grid-layout units)
    x: integer('x').notNull().default(0),
    y: integer('y').notNull().default(0),
    w: integer('w').notNull().default(4),
    h: integer('h').notNull().default(3),

    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
}, (t) => [
    index('widget_instances_user_idx').on(t.userId),
    check('widget_instances_refresh_min', sql`${t.refreshSeconds} >= 5`),
    check('widget_instances_layout_nonneg', sql`${t.x} >= 0 AND ${t.y} >= 0 AND ${t.w} >= 1 AND ${t.h} >= 1`),
])