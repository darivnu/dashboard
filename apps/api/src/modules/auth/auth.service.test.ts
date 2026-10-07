import '../../config/env.fakes'
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { fakeEnv } from '../../config/env.fakes'
import { AppError } from '../../lib/errors'
import type { Mail } from '../../lib/mailer'
import { hashToken } from '../../lib/tokens'
import { createFakeProvider, fakeCredentials } from '../../services/oauth/providers.fakes'
import type { FakeOAuthProvider } from '../../services/oauth/providers.fakes'
import { __resetRegistryForTests, registry } from '../../services/registry'
import { fakeService } from '../dashboard/dashboard.fakes'
import { createFakeSubscriptionsRepo } from '../subscriptions/subscriptions.fakes'
import { createClock, createFakeAuthRepo, createFakeMailer } from './auth.fakes'

// The services read env (webUrl, masterKey); import them after the fake env is in place.
const { createAuthService } = await import('./auth.service')
const { createSubscriptionsService } = await import('../subscriptions/subscriptions.service')

const EMAIL = 'alice@example.com'
const PASSWORD = 'correct horse battery staple'
const SECOND_MS = 1_000

let clock: ReturnType<typeof createClock>
let repo: ReturnType<typeof createFakeAuthRepo>
let mailer: ReturnType<typeof createFakeMailer>
let subscriptionsRepo: ReturnType<typeof createFakeSubscriptionsRepo>
let provider: FakeOAuthProvider
let service: ReturnType<typeof createAuthService>
let consoleError: ReturnType<typeof spyOn>

beforeEach(() => {
    clock = createClock(new Date('2026-01-01T00:00:00Z'))
    repo = createFakeAuthRepo(clock.now)
    mailer = createFakeMailer()
    subscriptionsRepo = createFakeSubscriptionsRepo()
    provider = createFakeProvider()
    // The real subscriptions service on a fake repo and a fake provider: revokeAll is exercised for real.
    const subscriptions = createSubscriptionsService(subscriptionsRepo, () => provider)
    service = createAuthService({ repo, mailer, subscriptions, now: clock.now })
    consoleError = spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    consoleError.mockRestore()
})

function tokenFromMail(mail: Mail): string {
    const match = mail.text.match(/\/verify-email\?token=([A-Za-z0-9_-]+)/)
    if (!match) throw new Error(`no verification link in mail:\n${mail.text}`)
    return match[1]!
}

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
    try {
        await promise
    } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect((error as AppError).status).toBe(status)
        expect((error as AppError).code).toBe(code)
        return
    }
    throw new Error(`expected AppError ${status} ${code}, but nothing was thrown`)
}

function registerAlice() {
    return service.register({ email: EMAIL, password: PASSWORD })
}

describe('register', () => {
    test('mails a link built from WEB_URL and stores only the token hash', async () => {
        await registerAlice()

        expect(mailer.sent).toHaveLength(1)
        const mail = mailer.sent[0]!
        expect(mail.to).toBe(EMAIL)
        expect(mail.text).toContain(`${fakeEnv.webUrl}/verify-email?token=`)

        const token = tokenFromMail(mail)
        expect(repo.tokens).toHaveLength(1)
        expect(repo.tokens[0]!.purpose).toBe('email_verification')
        expect(repo.tokens[0]!.tokenHash).toBe(hashToken(token))
        expect(repo.tokens[0]!.tokenHash).not.toBe(token)
    })

    test('the mailed token verifies the account once', async () => {
        await registerAlice()
        const token = tokenFromMail(mailer.sent[0]!)

        await service.verifyEmail(token)

        expect(repo.users[0]!.emailVerifiedAt).not.toBeNull()
        expect(repo.tokens[0]!.usedAt).not.toBeNull()
        await expectAppError(service.verifyEmail(token), 400, 'INVALID_TOKEN')
    })

    test('still creates the account and the token when the mailer fails', async () => {
        mailer.failure = new Error('connect ETIMEDOUT')

        const user = await registerAlice()

        expect(user.email).toBe(EMAIL)
        expect(repo.users).toHaveLength(1)
        expect(repo.tokens).toHaveLength(1)
        expect(mailer.sent).toHaveLength(0)
        expect(consoleError).toHaveBeenCalledTimes(1)
        expect(String(consoleError.mock.calls[0]?.[0])).toContain('connect ETIMEDOUT')
    })

    test('rejects a taken email, case-insensitively', async () => {
        await registerAlice()

        await expectAppError(service.register({ email: 'Alice@Example.com', password: PASSWORD }), 409, 'EMAIL_TAKEN')
        expect(repo.users).toHaveLength(1)
        expect(mailer.sent).toHaveLength(1)
    })
})

describe('resendVerification', () => {
    test('resolves with the same value for unknown, unverified, verified and disabled emails', async () => {
        await registerAlice()
        await service.register({ email: 'bob@example.com', password: PASSWORD })
        await service.verifyEmail(tokenFromMail(mailer.sent[1]!))
        await service.register({ email: 'carol@example.com', password: PASSWORD })
        repo.users[2]!.disabledAt = clock.now()
        clock.advance(61 * SECOND_MS)

        await expect(service.resendVerification('nobody@example.com')).resolves.toBeUndefined()
        await expect(service.resendVerification(EMAIL)).resolves.toBeUndefined()
        await expect(service.resendVerification('bob@example.com')).resolves.toBeUndefined()
        await expect(service.resendVerification('carol@example.com')).resolves.toBeUndefined()
    })

    test('sends nothing for an unknown email', async () => {
        await service.resendVerification('nobody@example.com')

        expect(mailer.sent).toHaveLength(0)
        expect(repo.tokens).toHaveLength(0)
    })

    test('sends a new link for an unverified account and keeps the earlier one valid', async () => {
        await registerAlice()
        const first = tokenFromMail(mailer.sent[0]!)
        clock.advance(61 * SECOND_MS)

        await service.resendVerification(EMAIL)

        expect(mailer.sent).toHaveLength(2)
        expect(repo.tokens).toHaveLength(2)
        const second = tokenFromMail(mailer.sent[1]!)
        expect(second).not.toBe(first)
        expect(repo.tokens.every((token) => token.usedAt === null)).toBe(true)

        await service.verifyEmail(first)
        expect(repo.users[0]!.emailVerifiedAt).not.toBeNull()
    })

    test('the new link works too', async () => {
        await registerAlice()
        clock.advance(61 * SECOND_MS)
        await service.resendVerification(EMAIL)

        await service.verifyEmail(tokenFromMail(mailer.sent[1]!))

        expect(repo.users[0]!.emailVerifiedAt).not.toBeNull()
    })

    test('sends nothing within 60 s of the last link, then sends again after', async () => {
        await registerAlice()

        clock.advance(59 * SECOND_MS)
        await service.resendVerification(EMAIL)
        expect(mailer.sent).toHaveLength(1)
        expect(repo.tokens).toHaveLength(1)

        clock.advance(2 * SECOND_MS)
        await service.resendVerification(EMAIL)
        expect(mailer.sent).toHaveLength(2)
        expect(repo.tokens).toHaveLength(2)

        await service.resendVerification(EMAIL)
        expect(mailer.sent).toHaveLength(2)
    })

    test('sends nothing for a verified account', async () => {
        await registerAlice()
        await service.verifyEmail(tokenFromMail(mailer.sent[0]!))
        clock.advance(61 * SECOND_MS)

        await service.resendVerification(EMAIL)

        expect(mailer.sent).toHaveLength(1)
        expect(repo.tokens).toHaveLength(1)
    })

    test('sends nothing for a disabled account', async () => {
        await registerAlice()
        repo.users[0]!.disabledAt = clock.now()
        clock.advance(61 * SECOND_MS)

        await service.resendVerification(EMAIL)

        expect(mailer.sent).toHaveLength(1)
        expect(repo.tokens).toHaveLength(1)
    })

    test('normalises the email before looking it up', async () => {
        await registerAlice()
        clock.advance(61 * SECOND_MS)

        await service.resendVerification('  ALICE@example.com ')

        expect(mailer.sent).toHaveLength(2)
        expect(mailer.sent[1]!.to).toBe(EMAIL)
    })

    test('survives a failing mailer without throwing', async () => {
        await registerAlice()
        clock.advance(61 * SECOND_MS)
        mailer.failure = new Error('535 Authentication failed')

        await expect(service.resendVerification(EMAIL)).resolves.toBeUndefined()

        expect(repo.tokens).toHaveLength(2)
        expect(consoleError).toHaveBeenCalledTimes(1)
    })
})

describe('deleteAccount', () => {
    const ACCESS = 'gho_alice-access-token'
    const API_KEY = 'super-secret-key-123'

    /** Registers, verifies and logs in: a user row, a used token and a session. */
    async function createAccount(email: string) {
        const sentBefore = mailer.sent.length
        await service.register({ email, password: PASSWORD })
        await service.verifyEmail(tokenFromMail(mailer.sent[sentBefore]!))
        await service.login({ email, password: PASSWORD, userAgent: null, ip: null })
        return repo.users.find((user) => user.email === email)!
    }

    /** The two fake repos are separate arrays; this makes deleting a user empty the other one, like the cascade. */
    function cascadeSubscriptions() {
        const deleteUser = repo.deleteUser
        repo.deleteUser = async (userId) => {
            const kept = subscriptionsRepo.rows.filter((row) => row.userId !== userId)
            subscriptionsRepo.rows.splice(0, subscriptionsRepo.rows.length, ...kept)
            return deleteUser(userId)
        }
    }

    beforeEach(() => {
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

    test('removes the user, their sessions and their tokens, and leaves another user untouched', async () => {
        const alice = await createAccount(EMAIL)
        const bob = await createAccount('bob@example.com')

        await service.deleteAccount(alice.id)

        expect(repo.users.map((user) => user.id)).toEqual([bob.id])
        expect(repo.sessions.map((session) => session.userId)).toEqual([bob.id])
        expect(repo.tokens.map((token) => token.userId)).toEqual([bob.id])
    })

    test('the email can be registered again afterwards', async () => {
        const alice = await createAccount(EMAIL)

        await service.deleteAccount(alice.id)

        await expectAppError(
            service.login({ email: EMAIL, password: PASSWORD, userAgent: null, ip: null }),
            401,
            'INVALID_CREDENTIALS',
        )
        const again = await registerAlice()
        expect(again.id).not.toBe(alice.id)
    })

    test('sends the access token of an OAuth subscription to the provider', async () => {
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })

        await service.deleteAccount(alice.id)

        expect(provider.calls.revoke).toEqual([ACCESS])
    })

    test('an apiKey subscription triggers no revoke', async () => {
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'stocks', { apiKey: API_KEY })

        await service.deleteAccount(alice.id)

        expect(provider.calls.revoke).toHaveLength(0)
    })

    test('another user\'s token is not revoked', async () => {
        const alice = await createAccount(EMAIL)
        const bob = await createAccount('bob@example.com')
        await subscriptionsRepo.upsert(bob.id, 'gh', { ...fakeCredentials({ accessToken: 'gho_bob' }) })

        await service.deleteAccount(alice.id)

        expect(provider.calls.revoke).toHaveLength(0)
    })

    test('still resolves, deletes the user and logs when the provider fails to revoke', async () => {
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })
        provider.revokeError = new TypeError('fetch failed')

        await expect(service.deleteAccount(alice.id)).resolves.toBeUndefined()

        expect(repo.users).toHaveLength(0)
        expect(consoleError).toHaveBeenCalledTimes(1)
        const logged = consoleError.mock.calls[0]!.map(String).join(' ')
        expect(logged).toContain('Could not revoke the gh token')
        expect(logged).not.toContain(ACCESS)
    })

    test('reads the tokens before the rows are deleted', async () => {
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })
        cascadeSubscriptions()

        await service.deleteAccount(alice.id)

        expect(subscriptionsRepo.rows).toHaveLength(0)
        expect(provider.calls.revoke).toEqual([ACCESS])
    })

    test('deletes the user before calling the provider', async () => {
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })
        let usersLeftAtRevoke = -1
        provider.revoke = async () => {
            usersLeftAtRevoke = repo.users.length
        }

        await service.deleteAccount(alice.id)

        expect(usersLeftAtRevoke).toBe(0)
    })

    test('skips a subscription whose service left the registry', async () => {
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'retired', { ...fakeCredentials({ accessToken: ACCESS }) })

        await expect(service.deleteAccount(alice.id)).resolves.toBeUndefined()

        expect(repo.users).toHaveLength(0)
        expect(provider.calls.revoke).toHaveLength(0)
        expect(consoleError).not.toHaveBeenCalled()
    })

    test('does not resolve before the provider has answered', async () => {
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })
        let answer!: () => void
        provider.revoke = () => new Promise<void>((resolve) => { answer = resolve })

        let resolved = false
        const deletion = service.deleteAccount(alice.id).then(() => { resolved = true })
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(resolved).toBe(false)

        answer()
        await deletion
        expect(resolved).toBe(true)
    })

    test('a failing revoke does not stop the other tokens from being revoked', async () => {
        registry.register(fakeService({
            id: 'gh_issues',
            name: 'GitHub issues',
            auth: { kind: 'oauth2', provider: 'github', scopes: ['repo'] },
        }))
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })
        await subscriptionsRepo.upsert(alice.id, 'gh_issues', { ...fakeCredentials({ accessToken: 'gho_second' }) })
        const asked: string[] = []
        provider.revoke = async (accessToken) => {
            asked.push(accessToken)
            if (accessToken === ACCESS) throw new TypeError('fetch failed')
        }

        await service.deleteAccount(alice.id)

        expect(asked.sort()).toEqual([ACCESS, 'gho_second'].sort())
        expect(consoleError).toHaveBeenCalledTimes(1)
    })

    test('still resolves and logs when the provider itself cannot be built', async () => {
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })
        const subscriptions = createSubscriptionsService(subscriptionsRepo, () => {
            throw new Error('broken provider configuration')
        })
        const broken = createAuthService({ repo, mailer, subscriptions, now: clock.now })

        await expect(broken.deleteAccount(alice.id)).resolves.toBeUndefined()

        expect(repo.users).toHaveLength(0)
        expect(consoleError).toHaveBeenCalledTimes(1)
        const logged = consoleError.mock.calls[0]!.map(String).join(' ')
        expect(logged).toContain('Could not revoke the gh token')
        expect(logged).not.toContain(ACCESS)
    })

    test('still deletes the account when the subscriptions cannot be read', async () => {
        const alice = await createAccount(EMAIL)
        await subscriptionsRepo.upsert(alice.id, 'gh', { ...fakeCredentials({ accessToken: ACCESS }) })
        subscriptionsRepo.listByUser = async () => {
            throw new Error(`cannot decrypt ${ACCESS}`)
        }

        await expect(service.deleteAccount(alice.id)).resolves.toBeUndefined()

        expect(repo.users).toHaveLength(0)
        expect(provider.calls.revoke).toHaveLength(0)
        expect(consoleError).toHaveBeenCalledTimes(1)
        const logged = consoleError.mock.calls[0]!.map(String).join(' ')
        expect(logged).toContain(`Could not read the subscriptions of user ${alice.id}`)
        expect(logged).not.toContain(ACCESS)
    })

    test('resolves when the user row is already gone', async () => {
        const alice = await createAccount(EMAIL)
        await service.deleteAccount(alice.id)

        await expect(service.deleteAccount(alice.id)).resolves.toBeUndefined()
    })
})
