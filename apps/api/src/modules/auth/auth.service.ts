import { env } from '../../config/env'
import { AppError } from '../../lib/errors'
import type { Mailer } from '../../lib/mailer'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../../lib/password'
import { generateToken, hashToken } from '../../lib/tokens'
import type { SessionUser } from '../../plugins/session'
import type { OAuthProviderId } from '../../services/oauth/ids'
import type { ProviderIdentity } from '../../services/oauth/providers'
import type { ServiceSubscriptionInstance } from '../subscriptions/subscriptions.repo'
import { OAuthFlowError } from '../subscriptions/subscriptions.service'
import type { SubscriptionsService } from '../subscriptions/subscriptions.service'
import type { AuthRepo, User } from './auth.repo'

const DAY_MS = 24 * 60 * 60 * 1000
const VERIFICATION_TTL_MS = 1 * DAY_MS
const RESEND_COOLDOWN_MS = 60 * 1000

export interface PublicUser {
  id: string
  email: string
  role: User['role']
  createdAt: Date
}

export interface AuthServiceDeps {
  repo: AuthRepo
  mailer: Mailer
  /** Only what deleting an account needs: read the subscriptions, then revoke their tokens. */
  subscriptions: Pick<SubscriptionsService, 'list' | 'revokeAll'>
  /** Clock. Tests inject a fixed one to drive the resend cooldown. */
  now?: () => Date
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

/** Message and code only. Never the whole error object, which may echo the SMTP exchange. */
function errorSummary(error: unknown): string {
  if (error instanceof Error) {
      const code = (error as { code?: unknown }).code
      return typeof code === 'string' ? `${code}: ${error.message}` : error.message
  }
  return String(error)
}

export function createAuthService({ repo, mailer, subscriptions, now = () => new Date() }: AuthServiceDeps) {
  /**
   * Stores a fresh verification token and mails the link. A failed send is
   * logged, not thrown: the account and the token exist, and the user can
   * ask for a new link. Database errors still propagate.
   */
  async function sendVerificationEmail(user: Pick<User, 'id' | 'email'>): Promise<void> {
      const token = generateToken()
      await repo.createUserToken({
          userId: user.id,
          purpose: 'email_verification',
          tokenHash: hashToken(token),
          expiresAt: new Date(now().getTime() + VERIFICATION_TTL_MS),
      })

      try {
          await mailer.send({
              to: user.email,
              subject: 'Verify your email',
              text: [
                  'Open this link to verify your email address:',
                  '',
                  `${env.webUrl}/verify-email?token=${token}`,
                  '',
                  'The link expires in 24 hours. If you did not create an account, ignore this message.',
              ].join('\n'),
          })
      } catch (error) {
          console.error(`Verification email for user ${user.id} was not sent: ${errorSummary(error)}`)
      }
  }

  /** The end of every login, by password or by provider: a new session for this user. */
  async function startSession(
      user: User | SessionUser,
      userAgent: string | null,
      ip: string | null,
  ): Promise<{ token: string; expiresAt: Date; user: PublicUser }> {
      const token = generateToken()
      const expiresAt = new Date(now().getTime() + env.sessionTtlDays * DAY_MS)
      await repo.createSession({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt,
          userAgent,
          ip,
      })

      return { token, expiresAt, user: toPublicUser(user) }
  }

  return {
      async register(input: { email: string; password: string }): Promise<PublicUser> {
          const email = normalizeEmail(input.email)
          const passwordHash = await hashPassword(input.password)

          const user = await repo.createUser({ email, passwordHash })
          if (!user) {
              throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists')
          }

          await sendVerificationEmail(user)

          return toPublicUser(user)
      },

      async verifyEmail(token: string): Promise<void> {
          const row = await repo.findValidUserToken(hashToken(token), 'email_verification')
          if (!row) throw invalidToken()

          const consumed = await repo.consumeEmailVerification(row.id, row.userId)
          if (!consumed) throw invalidToken()
      },

      /**
       * Always resolves, whatever the email: the route answers the same body
       * for unknown, verified, disabled and unverified accounts. Sends a new
       * link only for an unverified, enabled account whose newest
       * verification token is older than the cooldown. Earlier links stay
       * valid until they expire or are used.
       */
      async resendVerification(email: string): Promise<void> {
          const user = await repo.findUserByEmail(normalizeEmail(email))
          if (!user || user.emailVerifiedAt || user.disabledAt) return

          const latest = await repo.findLatestUserToken(user.id, 'email_verification')
          if (latest && now().getTime() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) return

          await sendVerificationEmail(user)
      },

      async login(input: {
          email: string
          password: string
          userAgent: string | null
          ip: string | null
      }): Promise<{ token: string; expiresAt: Date; user: PublicUser }> {
          const email = normalizeEmail(input.email)
          const user = await repo.findUserByEmail(email)

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

          return startSession(user, input.userAgent, input.ip)
      },

      /**
       * Logging in with a provider, once it told us who the user is. The
       * linking rules:
       * a. logged in already: link the provider account to that user;
       * b. provider account already linked: log in as its user;
       * c. a verified user has the same email: link it, log in as them;
       *    (c'. that user is not verified: refused)
       * d. otherwise: a new verified user without a password.
       * Every refusal throws before the session is created.
       */
      async loginWithProvider(input: {
          provider: OAuthProviderId
          identity: ProviderIdentity
          sessionUser: SessionUser | null
          userAgent: string | null
          ip: string | null
      }): Promise<{ token: string; expiresAt: Date; user: PublicUser }> {
          const { provider, identity, sessionUser } = input
          if (!identity.email)
              throw new OAuthFlowError('no_verified_email')
          const email = normalizeEmail(identity.email)
          // A small helper function, not a call: nothing is written to the database on this line.
          // link(someUserId) inserts the auth_identities row "this GitHub account logs in as someUserId".
          // Everything but the user id is the same in rules a, c and d, so it is filled in once here,
          // and each rule below only says WHICH user to link: link(sessionUser.id) or link(user.id).
          const link =(userId: string) => repo.linkIdentity({ userId, provider, providerUserId: identity.providerUserId, email })

          const owner = await repo.findUserByIdentity(provider, identity.providerUserId)

          // a. loadUser never returns a disabled user, so no disabled check here
          if (sessionUser) { // logged in already
              if (owner && owner.id !== sessionUser.id)
                  throw new OAuthFlowError('identity_taken')
              if (!owner)
                  await link(sessionUser.id)
              return startSession(sessionUser, input.userAgent, input.ip)
          }

          let user = owner // b.
          if (!user) {
              user = await repo.findUserByEmail(email)
              if (user && !user.emailVerifiedAt)
                  throw new OAuthFlowError('email_unverified') // c'.
              if (!user) {
                  // d. undefined = someone took the email between the two queries
                  user = await repo.createUser({ email, passwordHash: null, emailVerifiedAt: now() })
                  if (!user)
                      throw new OAuthFlowError('provider_error')
              }
              await link(user.id) // c. and d.
          }

          if (user.disabledAt)
              throw new OAuthFlowError('account_disabled')
          return startSession(user, input.userAgent, input.ip)
      },

      async logout(token: unknown): Promise<void> {
          if (typeof token !== 'string' || token === '') return
          await repo.deleteSessionByTokenHash(hashToken(token))
      },

      /**
       * Erases the account for good. The order matters:
       * 1. read the subscriptions while they exist, their tokens included;
       * 2. delete the user, which cascades to everything stored for them;
       * 3. ask the providers to revoke those tokens. Awaited, because the
       *    serverless runtime runs nothing after the response is sent.
       * A failed revocation is logged by revokeAll and never fails the
       * deletion. A user that is already gone (concurrent request) resolves too.
       * Subscriptions that cannot be read (a credential the current MASTER_KEY
       * cannot decrypt) do not block the erasure either: the account is
       * deleted and nothing is revoked.
       */
      async deleteAccount(userId: string): Promise<void> {
          let rows: ServiceSubscriptionInstance[] = []
          try {
              rows = await subscriptions.list(userId)
          } catch (error) {
              // The name only: a parse error's message can quote part of a decrypted credential.
              const name = error instanceof Error ? error.name : typeof error
              console.error(`Could not read the subscriptions of user ${userId} before deleting the account, no token will be revoked: ${name}`)
          }
          await repo.deleteUser(userId)
          await subscriptions.revokeAll(rows)
      },

      me(user: SessionUser): PublicUser {
          return toPublicUser(user)
      },
  }
}

export type AuthService = ReturnType<typeof createAuthService>
