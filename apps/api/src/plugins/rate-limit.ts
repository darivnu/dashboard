import { Elysia } from 'elysia'
import { getClientIp } from '../lib/http'

const WINDOW_MS = 60_000
const MAX_REQUESTS = 10

interface Bucket {
    count: number
    resetAt: number
}

const buckets = new Map<string, Bucket>()

function hit(key: string): { limited: boolean; retryAfterSeconds: number } {
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
        return { limited: false, retryAfterSeconds: 0 }
    }

    bucket.count += 1
    if (bucket.count > MAX_REQUESTS) {
        return { limited: true, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) }
    }

    return { limited: false, retryAfterSeconds: 0 }
}

// In-memory fixed-window limiter, keyed by client IP. Single-instance only (out of scope: distributed limiting).
export const rateLimit = new Elysia({ name: 'rate-limit' })
    .onBeforeHandle({ as: 'scoped' }, ({ request, server, set }) => {
        const ip = getClientIp(request, server)
        const { limited, retryAfterSeconds } = hit(ip)
        if (!limited) return

        set.status = 429 // Too Many Requests
        set.headers['Retry-After'] = String(retryAfterSeconds)
        return { error: 'RATE_LIMITED', message: 'Too many requests, try again later' }
    })
