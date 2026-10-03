import { existsSync } from 'node:fs'
import { Elysia, NotFoundError } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { registerServices } from './services/register'
import { AppError, errorHandler } from './lib/errors'
import { authRoutes } from './modules/auth/auth.routes'
import { aboutRoutes } from './modules/about/about.routes'
import { catalogRoutes } from './modules/catalog/catalog.routes'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'
import { subscriptionsRoutes } from './modules/subscriptions/subscriptions.routes'
import { openapi } from '@elysiajs/openapi'
import { env, isDev } from './config/env'
import { cors } from './plugins/cors'
import { SESSION_COOKIE } from './plugins/session'

registerServices(env.nodeEnv)

const api = new Elysia({ prefix: '/api' })
    .use(cors)
    .get('/health', () => ({ ok: true }))
    .use(authRoutes)
    .use(catalogRoutes)
    .use(dashboardRoutes)
    .use(subscriptionsRoutes)
    .all('*', () => {
        throw new AppError(404, 'NOT_FOUND', 'Route not found')
    })

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
                { name: 'Subscriptions', description: 'The current user\'s service subscriptions (credentials are write-only)' },
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
    app.use(staticPlugin({ assets: '../web/dist', prefix: '/', indexHTML: true, alwaysStatic: true }))
    app.get('/*', ({ path }) => {
        if (path.startsWith('/api')) throw new NotFoundError()
        return Bun.file('../web/dist/index.html')
    })
}

export default app
export type App = typeof app
