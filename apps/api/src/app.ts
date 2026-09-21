import { existsSync } from 'node:fs'
import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import './services/definitions'
import { errorHandler } from './lib/errors'
import { authRoutes } from './modules/auth/auth.routes'
import { aboutRoutes } from './modules/about/about.routes'
import { catalogRoutes } from './modules/catalog/catalog.routes'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'
import { openapi } from '@elysiajs/openapi'
import { isDev } from './config/env'
import { SESSION_COOKIE } from './plugins/session'

const api = new Elysia({ prefix: '/api' })
    .get('/health', () => ({ ok: true }))
    .use(authRoutes)
    .use(catalogRoutes)
    .use(dashboardRoutes)

if (isDev) {
    api.use(openapi({
        documentation: {
            info: {
                title: 'Dashboard API',
                version: '0.1.0',
                description: 'Widgets from third-party services on a personal dashboard. Log in with POST /api/auth/login; the session cookie it sets authenticates every other call.',
            },
            tags: [
                { name: 'Catalog', description: 'Services and widgets that can be placed on a dashboard' },
                { name: 'Dashboard', description: 'The current user\'s widget instances, their layout and their data' },
            ],
            components: {
                securitySchemes: {
                    cookieAuth: {
                        type: 'apiKey',
                        in: 'cookie',
                        name: SESSION_COOKIE,
                        description: 'Session cookie set by POST /api/auth/login',
                    },
                },
            },
        },
    }))
}

export const app = new Elysia()
    .use(errorHandler)
    .use(api)
    .use(aboutRoutes)

if (existsSync('../web/dist')) {
    app.use(staticPlugin({ assets: '../web/dist', prefix: '/', indexHTML: true }))
}