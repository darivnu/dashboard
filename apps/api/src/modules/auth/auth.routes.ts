import { Elysia, t } from 'elysia'
import { isDev } from '../../config/env'
import { requireAuth, SESSION_COOKIE } from '../../plugins/session'
import { authService } from './auth.service'

const credentialsBody = t.Object({
    email: t.String({ format: 'email', maxLength: 254}),
    password: t.String({minLength: 8, maxLength: 128}),
})

const verifyEmailBody = t.Object({
    token: t.String({ minLength: 1, maxLength: 128}),
})

const cookieOptions = {
    httpOnly: true,
    secure: !isDev,
    sameSite: 'lax',
    path: '/',
} as const

export const authRoutes = new Elysia ({ prefix: '/auth'})
    .post('/register', async ({ body, set }) => {
        const user = await authService.register(body)
        set.status = 201
        return user
    }, { body: credentialsBody })
    
    .post('/verify-email', async ({ body }) => {
        await authService.verifyEmail(body.token)
        return { ok: true }
    }, { body: verifyEmailBody })

    .post('/login', async ({ body, cookie, request, server }) => {
        const { token, expiresAt, user } = await authService.login({
            email: body.email,
            password: body.password,
            userAgent: request.headers.get('user-agent'),
            ip: server?.requestIP(request)?.address ?? null,
        })

        cookie[SESSION_COOKIE].set({
            ...cookieOptions,
            value: token,
            expires: expiresAt,
        })

        return user
    }, { body: credentialsBody })

    .post('/logout', async ({ cookie }) => {
        await authService.logout(cookie[SESSION_COOKIE].value)

        cookie[SESSION_COOKIE].set({
            ...cookieOptions,
            value: '',
            expires: new Date(0),
            maxAge: 0,
        })

        return { ok: true }
    })

    .use(requireAuth)

    .get('/me', ({ user }) => authService.me(user)) 
