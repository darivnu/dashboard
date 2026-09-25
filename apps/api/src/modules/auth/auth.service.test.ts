import '../../config/env.fakes'
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { fakeEnv } from '../../config/env.fakes'
import { AppError } from '../../lib/errors'
import type { Mail } from '../../lib/mailer'
import { hashToken } from '../../lib/tokens'
import { createClock, createFakeAuthRepo, createFakeMailer } from './auth.fakes'

// The service reads env.webUrl; import it after the fake env is in place.
const { createAuthService } = await import('./auth.service')

const EMAIL = 'alice@example.com'
const PASSWORD = 'correct horse battery staple'
const SECOND_MS = 1_000

let clock: ReturnType<typeof createClock>
let repo: ReturnType<typeof createFakeAuthRepo>
let mailer: ReturnType<typeof createFakeMailer>
let service: ReturnType<typeof createAuthService>
let consoleError: ReturnType<typeof spyOn>

beforeEach(() => {
    clock = createClock(new Date('2026-01-01T00:00:00Z'))
    repo = createFakeAuthRepo(clock.now)
    mailer = createFakeMailer()
    service = createAuthService({ repo, mailer, now: clock.now })
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
