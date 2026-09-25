import { cors as corsPlugin } from '@elysiajs/cors'
import { env } from '../config/env'

// origin is an allow-list, never '*' — required so Access-Control-Allow-Credentials can be true.
export const cors = corsPlugin({
    origin: env.corsOrigins,
    credentials: true,
})
