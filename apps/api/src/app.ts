import { existsSync } from 'node:fs'
import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { errorHandler } from './lib/errors'
import { authRoutes } from './modules/auth/auth.routes'
import { openapi } from '@elysiajs/openapi'
import { isDev } from './config/env'

export const app = new Elysia({ prefix: '/api' })

if (isDev) {
    app.use(openapi())
}

app
    .use(errorHandler)
    .get('/health', () => ({ ok: true }))
    .use(authRoutes)

if (existsSync('../web/dist')) {
    app.use(staticPlugin({ assets: '../web/dist', prefix: '/', indexHTML: true}))
}


