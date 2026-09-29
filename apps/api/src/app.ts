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
export type App = typeof app
import { env, isDev } from './config/env'
import { cors } from './plugins/cors'
import { SESSION_COOKIE } from './plugins/session'

// Fill the registry once, before any route can read it. Which services end
// up registered depends on NODE_ENV — see services/register.ts.
registerServices(env.nodeEnv)


const api = new Elysia({ prefix: '/api' })
    .use(cors)
    .get('/health', () => ({ ok: true }))
    .use(authRoutes)
    .use(catalogRoutes)
    .use(dashboardRoutes)
    .use(subscriptionsRoutes)
    // Catches unknown /api/* paths and unsupported methods before the SPA's
    // static-file fallback would otherwise serve index.html for them.
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

// In production the web build is served from the same origin. Static files
// are matched first; anything else that isn't an API route falls back to
// index.html so client-side routes (e.g. /dashboard) survive a hard reload.
if (existsSync('../web/dist')) {
    app.use(staticPlugin({ assets: '../web/dist', prefix: '/', indexHTML: true }))
    app.get('/*', ({ path }) => {
        if (path.startsWith('/api')) throw new NotFoundError()
        return Bun.file('../web/dist/index.html')
    })
}
// Vercel imports this module and serves the exported app as a function.
export default app
