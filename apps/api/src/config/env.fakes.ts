import { mock } from 'bun:test'

/**
 * Test-only. Importing this file replaces `config/env` with fixed values, so
 * modules that read env while loading (lib/mailer, auth.service) need neither
 * a .env nor real variables. `smtp` is null: the console mailer is selected.
 *
 * Import it before the module under test.
 */
export const fakeEnv = {
    nodeEnv: 'test',
    port: 8080,
    databaseUrl: 'postgres://unused',
    appUrl: 'http://localhost:8080',
    webUrl: 'http://localhost:5173',
    corsOrigins: ['http://localhost:5173'],
    sessionTtlDays: 30,
    smtp: null,
} as const

mock.module('./env', () => ({
    env: fakeEnv,
    isDev: false,
    isProd: false,
}))
