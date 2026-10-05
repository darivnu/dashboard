const DEFAULT_SWEEP_AT = 1000

interface Bucket {
    count: number
    resetAt: number
}

export interface FixedWindowLimiterOptions {
    /** Clock in milliseconds. Injectable so tests can move time without sleeping. */
    now?: () => number
    /** Number of stored keys from which a hit first drops the expired records. */
    sweepAt?: number
}

export interface LimiterResult {
    limited: boolean
    /** Seconds until the current window ends; 0 when the hit is allowed. */
    retryAfterSeconds: number
}

export interface FixedWindowLimiter {
    /** Counts one call for `key` and says whether it goes over `max` calls per `windowSeconds`. */
    hit(key: string, max: number, windowSeconds: number): LimiterResult
    readonly size: number
}

/**
 * In-memory fixed-window limiter. The window of a key starts at its first hit
 * and lasts `windowSeconds`; hits inside it only increment the count.
 *
 * Single-instance only (out of scope: distributed limiting). Unrelated to the
 * IP limiter in plugins/rate-limit.ts: the two share no state.
 */
export function createFixedWindowLimiter(options: FixedWindowLimiterOptions = {}): FixedWindowLimiter {
    const now = options.now ?? Date.now
    const sweepAt = options.sweepAt ?? DEFAULT_SWEEP_AT
    const buckets = new Map<string, Bucket>()

    // No timer: a record whose window ended is only removed here, when the map
    // has grown, or replaced when its own key is hit again.
    function sweep(current: number): void {
        for (const [key, bucket] of buckets) {
            if (bucket.resetAt <= current) buckets.delete(key)
        }
    }

    return {
        hit(key, max, windowSeconds) {
            const current = now()
            if (buckets.size >= sweepAt) sweep(current)

            const bucket = buckets.get(key)
            if (!bucket || bucket.resetAt <= current) {
                buckets.set(key, { count: 1, resetAt: current + windowSeconds * 1000 })
                return { limited: false, retryAfterSeconds: 0 }
            }

            bucket.count += 1
            if (bucket.count > max) {
                return { limited: true, retryAfterSeconds: Math.ceil((bucket.resetAt - current) / 1000) }
            }

            return { limited: false, retryAfterSeconds: 0 }
        },

        get size() {
            return buckets.size
        },
    }
}
