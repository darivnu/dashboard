import { existsSync } from 'node:fs'
import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import './services/definitions'
import { AppError, errorHandler } from './lib/errors'
import { authRoutes } from './modules/auth/auth.routes'
import { aboutRoutes } from './modules/about/about.routes'
import { openapi } from '@elysiajs/openapi'
import { isDev } from './config/env'
import { cors } from './plugins/cors'

const api = new Elysia({ prefix: '/api' })
    .use(cors)
    .get('/health', () => ({ ok: true }))
    .use(authRoutes)
    // Catches unknown /api/* paths and unsupported methods before the SPA's
    // static-file fallback would otherwise serve index.html for them.
    .all('*', () => {
        throw new AppError(404, 'NOT_FOUND', 'Route not found')
    })

if (isDev) {
    api.use(openapi())
}

export const app = new Elysia()
    .use(errorHandler)
    .use(api)
    .use(aboutRoutes)

if (existsSync('../web/dist')) {
    app.use(staticPlugin({ assets: '../web/dist', prefix: '/', indexHTML: true }))
}