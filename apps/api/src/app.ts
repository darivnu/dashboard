import { existsSync } from 'node:fs'
import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { errorHandler } from './lib/errors'
import { authRoutes } from './modules/auth/auth.routes'

export const app = new Elysia()
    .use(errorHandler)
    .get('/health', () => ({ ok: true }))
    .use(authRoutes)

if (existsSync('../web/dist')) {
    app.use(staticPlugin({ assets: '../web/dist', prefix: '/', indexHTML: true}))
}


