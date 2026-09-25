import { Elysia, t } from 'elysia'
import { mailer } from '../../lib/mailer'
import { auth, sessionCookieOptions, SESSION_COOKIE } from '../../plugins/session'
import { rateLimit } from '../../plugins/rate-limit'
import { authRepo } from './auth.repo'
import { createAuthService } from './auth.service'

const authService = createAuthService({ repo: authRepo, mailer })

const publicUser = t.Object({
    id: t.String({ format: 'uuid' }),
    email: t.String({ format: 'email' }),
    role: t.Union([t.Literal('user'), t.Literal('admin')]),
    createdAt: t.Date(),
})

const ok = t.Object({ ok: t.Literal(true) })

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

export const authRoutes = new Elysia ({ prefix: '/auth'})
    .use(auth)
    .use(rateLimit)
    .model({
        'auth.credentials': credentialsBody,
        'auth.verifyEmailBody': verifyEmailBody,
        'auth.emailBody': emailBody,
        'auth.user': publicUser,
        'auth.ok': ok,
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
    