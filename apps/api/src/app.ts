import { existsSync } from 'node:fs'
import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import './services/definitions'
import { errorHandler } from './lib/errors'
import { authRoutes } from './modules/auth/auth.routes'
import { aboutRoutes } from './modules/about/about.routes'
import { openapi } from '@elysiajs/openapi'
import { isDev } from './config/env'
import {cors} from '@elysiajs/cors'
import { env } from './config/env'

const api = new Elysia({ prefix: '/api' })
    .get('/health', () => ({ ok: true }))
    .use(authRoutes)

if (isDev) {
    api.use(openapi())
}

export const app = new Elysia()
    .use(errorHandler)
    .use(cors(
        {
            origin: env.appUrl,
            credentials: true,
        }
    ))
    .use(api)
    .use(aboutRoutes)

if (existsSync('../web/dist')) {
    app.use(staticPlugin({ assets: '../web/dist', prefix: '/', indexHTML: true }))
}