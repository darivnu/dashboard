import { Elysia, t } from 'elysia'
import { mailer } from '../../lib/mailer'
import { auth, sessionCookieOptions, SESSION_COOKIE } from '../../plugins/session'
import { rateLimit } from '../../plugins/rate-limit'
import { getProvider } from '../../services/oauth/providers'
import { subscriptionsRepo } from '../subscriptions/subscriptions.repo'
import { createSubscriptionsService } from '../subscriptions/subscriptions.service'
import { authRepo } from './auth.repo'
import { createAuthService } from './auth.service'

// Deleting an account revokes the user's OAuth tokens, which is the subscriptions service's job.
const subscriptions = createSubscriptionsService(subscriptionsRepo, getProvider)
const authService = createAuthService({ repo: authRepo, mailer, subscriptions })

const publicUser = t.Object({
    id: t.String({ format: 'uuid' }),
    email: t.String({ format: 'email' }),
    role: t.Union([t.Literal('user'), t.Literal('admin')]),
    createdAt: t.Date(),
})

const ok = t.Object({
    ok: t.Literal(true, { description: 'Always true: a failure answers with an error envelope instead' }),
}, { description: 'The operation was carried out' })

const errorResponse = t.Object({
    error: t.String({
        description: 'Machine-readable error code',
        examples: ['UNAUTHORIZED', 'RATE_LIMITED'],
    }),
    message: t.String({
        description: 'Human-readable explanation, in English',
        examples: ['Authentication required', 'Too many requests, try again later'],
    }),
}, { description: 'Error envelope produced by the global error handler and the rate limiter' })

const credentialsBody = t.Object({
    email: t.String({ format: 'email', maxLength: 254}),
    password: t.String({minLength: 8, maxLength: 128}),
})

const verifyEmailBody = t.Object({
    token: t.String({ minLength: 1, maxLength: 128}),
})

const emailBody = t.Object({
    email: t.String({ format: 'email', maxLength: 254 }),
})

export const authRoutes = new Elysia ({
    prefix: '/auth',
    detail: {
        tags: ['Auth'],
    },
})
    .use(auth)
    .use(rateLimit)
    .model({
        'auth.credentials': credentialsBody,
        'auth.verifyEmailBody': verifyEmailBody,
        'auth.emailBody': emailBody,
        'auth.user': publicUser,
        'auth.ok': ok,
        'auth.error': errorResponse,
    })
    .post('/register', async ({ body, set }) => {
        const user = await authService.register(body)
        set.status = 201
        return user
    }, {
        body: 'auth.credentials',
        response: { 201: 'auth.user' },
    })

    .post('/verify-email', async ({ body }) => {
        await authService.verifyEmail(body.token)
        return { ok: true }
    }, {
        body: 'auth.verifyEmailBody',
        response: 'auth.ok',
    })

    .post('/resend-verification', async ({ body }) => {
        await authService.resendVerification(body.email)
        return { ok: true }
    }, {
        body: 'auth.emailBody',
        response: 'auth.ok',
        detail: {
            summary: 'Send a new verification link',
            description: 'Always answers { ok: true }, whether or not the email belongs to an unverified account. At most one link per minute per account; earlier links stay valid until \
            they expire or are used.',
        },
    })

    .post('/login', async ({ body, cookie, request, server }) => {
        const { token, expiresAt, user } = await authService.login({
            email: body.email,
            password: body.password,
            userAgent: request.headers.get('user-agent'),
            ip: server?.requestIP(request)?.address ?? null,
        })

        cookie[SESSION_COOKIE].set({
            ...sessionCookieOptions(),
            value: token,
            expires: expiresAt,
        })

        return user
    }, {
        body: 'auth.credentials',
        response: 'auth.user',
    })

    .post('/logout', async ({ cookie }) => {
        await authService.logout(cookie[SESSION_COOKIE].value)

        cookie[SESSION_COOKIE].set({
            ...sessionCookieOptions(),
            value: '',
            expires: new Date(0),
            maxAge: 0,
        })

        return { ok: true }
    }, {
        response: 'auth.ok',
    })

    .get('/me', ({ user }) => authService.me(user), {
        auth: true,
        response: 'auth.user',
    })

    // Must stay DELETE, never POST. The session cookie is SameSite=None in
    // production, so the browser attaches it to requests coming from any site.
    // An HTML form cannot send DELETE, and a script on another origin first
    // triggers a CORS preflight, which the allow-list in plugins/cors.ts rejects.
    .delete('/me', async ({ user, cookie }) => {
        await authService.deleteAccount(user.id)

        cookie[SESSION_COOKIE].set({
            ...sessionCookieOptions(),
            value: '',
            expires: new Date(0),
            maxAge: 0,
        })

        return { ok: true }
    }, {
        auth: true,
        response: {
            200: 'auth.ok',
            401: 'auth.error',
            429: 'auth.error',
        },
        detail: {
            summary: 'Delete the current user\'s account',
            description: 'Permanently erases the logged-in user and everything stored for them: the account, every session on every device, one-time tokens, service subscriptions with their stored credentials, and widget instances. It cannot be undone and takes no request body. The session \
            cookie is expired in the response, and every other session of the user stops working at once. OAuth tokens are revoked at their provider on a best-effort basis: a provider that cannot be reached does not fail the deletion and is not reported here. \
            Rate limited per IP together with the other auth routes.',
            security: [{ cookieAuth: [] }],
        },
    })
