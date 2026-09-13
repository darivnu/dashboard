import { env } from '../../config/env'
import { AppError } from '../../lib/errors'
import { mailer } from '../../lib/mailer'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../lib/password'
import { generateToken, hashToken } from '../../lib/tokens'
import type { SessionUser } from '../../plugins/session'
import { authRepo, type User } from './auth.repo'

const DAY_MS = 24 * 60 * 60 * 1000
const VERIFICATION_TTL_MS = 1 * DAY_MS

export interface PublicUser {
    id: string
    email: string
    role: User['role']
    createdAt: Date
}

function toPublicUser(user: User | SessionUser): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
}

function invalidToken(): AppError {
    return new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has expired')
}

export const authService = {
    async register(input: { email: string; password: string }): Promise<PublicUser> {
      const email = normalizeEmail(input.email)
      const passwordHash = await hashPassword(input.password)

      const user = await authRepo.createUser({ email, passwordHash })
      if (!user) {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists')
      }

      const token = generateToken()
      await authRepo.createUserToken({
        userId: user.id,
        purpose: 'email_verification',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      })

      await mailer.send({
        to: email,
        subject: 'Verify your email',
        text: [
          'Open this link to verify your email address:',
          '',
          `${env.appUrl}/verify-email?token=${token}`,
          '',
          'The link expires in 24 hours. If you did not create an account, ignore this message.',
        ].join('\n'),
      })

      return toPublicUser(user)
    },

    async verifyEmail(token: string): Promise<void> {
      const row = await authRepo.findValidUserToken(hashToken(token), 'email_verification')
      if (!row) throw invalidToken()

      const consumed = await authRepo.consumeEmailVerification(row.id, row.userId)
      if (!consumed) throw invalidToken()
    },

    async login(input: {
      email: string
      password: string
      userAgent: string | null
      ip: string | null
    }): Promise<{ token: string; expiresAt: Date; user: PublicUser }> {
      const email = normalizeEmail(input.email)
      const user = await authRepo.findUserByEmail(email)

      const passwordMatches = await verifyPassword(
        input.password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      )
      if (!user || !passwordMatches) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
      }
      if (user.disabledAt) {
        throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been disabled')
      }
      if (!user.emailVerifiedAt) {
        throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before logging in')
      }

      const token = generateToken()
      const expiresAt = new Date(Date.now() + env.sessionTtlDays * DAY_MS)
      await authRepo.createSession({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        userAgent: input.userAgent,
        ip: input.ip,
      })

      return { token, expiresAt, user: toPublicUser(user) }
    },

    async logout(token: unknown): Promise<void> {
      if (typeof token !== 'string' || token === '') return
      await authRepo.deleteSessionByTokenHash(hashToken(token))
    },

    me(user: SessionUser): PublicUser {
      return toPublicUser(user)
    },
}