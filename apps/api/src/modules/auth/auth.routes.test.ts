import '../../config/env.fakes'
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { ALICE, BOB, fakeSession, loggedIn } from '../../plugins/session.fakes'
import type { FakeSessionUser } from '../../plugins/session.fakes'
import { errorHandler } from '../../lib/errors'
import { __setProviderForTests } from '../../services/oauth/providers'
import { createFakeProvider, fakeCredentials } from '../../services/oauth/providers.fakes'
import type { FakeOAuthProvider } from '../../services/oauth/providers.fakes'
import { __resetRegistryForTests, registry } from '../../services/registry'
import { fakeService } from '../dashboard/dashboard.fakes'
import { createFakeSubscriptionsRepo } from '../subscriptions/subscriptions.fakes'
import { createFakeAuthRepo } from './auth.fakes'

// The routes file wires the real Drizzle repos at import time; swap both for
// the in-memory ones before loading the routes.
const repo = createFakeAuthRepo()
const subscriptionsRepo = createFakeSubscriptionsRepo()
mock.module('./auth.repo', () => ({ authRepo: repo }))
mock.module('../subscriptions/subscriptions.repo', () => ({ subscriptionsRepo }))

const { authRoutes } = await import('./auth.routes')

const app = new Elysia().use(errorHandler).use(authRoutes)

// The module's limiter puts every request of this file under one key (no client
// IP in tests) and answers 429 from the 11th within a minute. Only requests
// that get past the session check are counted: 3 here. Keep it under 10.
const ACCESS = 'gho_alice-access-token'
const API_KEY = 'super-secret-key-123'
const PASSWORD_HASH = '$argon2id$fake-password-hash'

async function deleteMe(options: { session?: boolean } = {}) {
    const response = await app.handle(new Request('http://localhost/auth/me', {
        method: 'DELETE',
        headers: options.session === false ? {} : loggedIn,
    }))
    const text = await response.text()
    return { status: response.status, body: JSON.parse(text), text, setCookie: response.headers.getSetCookie() }
}

/** Puts the session user in the fake users table, with a session and a token like a real account has. */
function seedAccount(user: FakeSessionUser) {
    repo.users.push({
        id: user.id,
        email: user.email,
        passwordHash: PASSWORD_HASH,
        emailVerifiedAt: new Date(0),
        role: user.role,
        disabledAt: null,
        createdAt: user.createdAt,
        updatedAt: user.createdAt,
    })
    repo.sessions.push({ tokenHash: `session-of-${user.id}`, userId: user.id })
    repo.tokens.push({
        id: crypto.randomUUID(),
        userId: user.id,
        purpose: 'email_verification',
        tokenHash: `token-of-${user.id}`,
        expiresAt: new Date(0),
        usedAt: new Date(0),
        createdAt: new Date(0),
    })
}

let provider: FakeOAuthProvider
let consoleError: ReturnType<typeof spyOn>

beforeEach(() => {
    repo.users.length = 0
    repo.sessions.length = 0
    repo.tokens.length = 0
    subscriptionsRepo.rows.length = 0
    fakeSession.user = ALICE
    seedAccount(ALICE)
    seedAccount(BOB)

    provider = createFakeProvider()
    __setProviderForTests('github', provider)
    consoleError = spyOn(console, 'error').mockImplementation(() => {}) //a failed revoke is logged on purpose

    __resetRegistryForTests()
    registry.register(fakeService({
        id: 'gh',
        name: 'GitHub',
        auth: { kind: 'oauth2', provider: 'github', scopes: ['notifications'] },
    }))
    registry.register(fakeService({
        id: 'stocks',
        name: 'Stocks',
        auth: {
            kind: 'apiKey',
            fields: [{ name: 'apiKey', type: 'string', label: 'API key', required: true }],
        },
    }))
})

afterEach(() => {
    __setProviderForTests('github', undefined)
    consoleError.mockRestore()
})

describe('DELETE /auth/me', () => {
    test('without a session is 401 and deletes nothing', async () => {
        await subscriptionsRepo.upsert(ALICE.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })

        const { status, body } = await deleteMe({ session: false })

        expect(status).toBe(401)
        expect(body).toEqual({ error: 'UNAUTHORIZED', message: 'Authentication required' })
        expect(repo.users).toHaveLength(2)
        expect(repo.sessions).toHaveLength(2)
        expect(repo.tokens).toHaveLength(2)
        expect(provider.calls.revoke).toHaveLength(0)
    })

    test('with an unknown or expired session cookie is 401 and deletes nothing', async () => {
        fakeSession.user = null

        const { status } = await deleteMe()

        expect(status).toBe(401)
        expect(repo.users).toHaveLength(2)
    })

    test('answers 200 { ok: true }, expires the session cookie and deletes only that account', async () => {
        const { status, body, setCookie } = await deleteMe()

        expect(status).toBe(200)
        expect(body).toEqual({ ok: true })

        expect(setCookie).toHaveLength(1)
        expect(setCookie[0]).toStartWith('session=;')
        expect(setCookie[0]).toContain('Max-Age=0')
        expect(setCookie[0]).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
        expect(setCookie[0]).toContain('HttpOnly')
        expect(setCookie[0]).toContain('Path=/')

        expect(repo.users.map((user) => user.id)).toEqual([BOB.id])
        expect(repo.sessions.map((session) => session.userId)).toEqual([BOB.id])
        expect(repo.tokens.map((token) => token.userId)).toEqual([BOB.id])
    })

    test('revokes the OAuth token and returns no credential', async () => {
        await subscriptionsRepo.upsert(ALICE.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })
        await subscriptionsRepo.upsert(ALICE.id, 'stocks', { apiKey: API_KEY })

        const { status, text } = await deleteMe()

        expect(status).toBe(200)
        expect(provider.calls.revoke).toEqual([ACCESS])
        expect(text).not.toContain(ACCESS)
        expect(text).not.toContain(API_KEY)
        expect(text).not.toContain(PASSWORD_HASH)
    })

    test('a failing revoke changes neither the status nor the body, and is logged without the token', async () => {
        await subscriptionsRepo.upsert(ALICE.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })
        provider.revokeError = new TypeError('fetch failed')

        const { status, body } = await deleteMe()

        expect(status).toBe(200)
        expect(body).toEqual({ ok: true })
        expect(repo.users.map((user) => user.id)).toEqual([BOB.id])
        expect(consoleError).toHaveBeenCalledTimes(1)
        const logged = consoleError.mock.calls[0]!.map(String).join(' ')
        expect(logged).toContain('Could not revoke the gh token')
        expect(logged).not.toContain(ACCESS)
    })

    // A form can send POST across sites; it cannot send DELETE.
    test('POST /auth/me does not delete the account', async () => {
        const response = await app.handle(new Request('http://localhost/auth/me', { method: 'POST', headers: loggedIn }))

        expect(response.status).toBe(404)
        expect(repo.users).toHaveLength(2)
    })
})

describe('OpenAPI', () => {
    // Asks the real generator, so this reads what /openapi shows. Not an /auth request: the limiter ignores it.
    async function documentedDelete() {
        const docs = new Elysia().use(openapi()).use(authRoutes)
        const response = await docs.handle(new Request('http://localhost/openapi/json'))
        const spec = await response.json() as {
            paths: Record<string, Record<string, any>>
            components: { schemas: Record<string, any> }
        }
        return { operation: spec.paths['/auth/me']!.delete, schemas: spec.components.schemas }
    }

    test('DELETE /auth/me is under the Auth tag with a summary, a description and cookie security', async () => {
        const { operation } = await documentedDelete()

        expect(operation.tags).toEqual(['Auth'])
        expect(operation.summary).toBe('Delete the current user\'s account')
        expect(operation.description).toContain('cannot be undone')
        expect(operation.description).toContain('best-effort')
        expect(operation.security).toEqual([{ cookieAuth: [] }])
        expect(operation.requestBody).toBeUndefined()
    })

    test('documents the 200, 401 and 429 responses with described models', async () => {
        const { operation, schemas } = await documentedDelete()

        expect(Object.keys(operation.responses).sort()).toEqual(['200', '401', '429'])
        expect(JSON.stringify(operation.responses['200'])).toContain('auth.ok')
        expect(JSON.stringify(operation.responses['401'])).toContain('auth.error')
        expect(JSON.stringify(operation.responses['429'])).toContain('auth.error')

        expect(schemas['auth.ok'].description).toBeString()
        expect(schemas['auth.error'].description).toBeString()
        expect(schemas['auth.error'].properties.error.description).toBeString()
        expect(schemas['auth.error'].properties.error.examples).toContain('UNAUTHORIZED')
        expect(schemas['auth.error'].properties.message.description).toBeString()
    })
})
