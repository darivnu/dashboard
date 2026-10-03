import type { WidgetParams } from '../services/types'

const DEFAULT_MAX_ENTRIES = 1000

interface Entry<T> {
    value: T
    expiresAt: number
}

export interface TtlCache<T> {
    get(key: string): T | undefined
    set(key: string, value: T, ttlSeconds: number): void
    delete(key: string): void
    clear(): void
    readonly size: number
}

export interface TtlCacheOptions {
    /** Hard cap on stored entries; the oldest entry is evicted once it is reached. */
    maxEntries?: number
    /** Clock in milliseconds. Injectable so tests can move time without sleeping. */
    now?: () => number
}

export function createTtlCache<T>(options: TtlCacheOptions = {}): TtlCache<T> {
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    const now = options.now ?? Date.now
    const entries = new Map<string, Entry<T>>()

    function evictExpired(): void {
        const current = now()
        for (const [key, entry] of entries) {
            if (entry.expiresAt <= current) entries.delete(key)
        }
    }

    return {
        get(key) {
            const entry = entries.get(key)
            if (!entry) return undefined

            if (entry.expiresAt <= now()) {
                entries.delete(key)
                return undefined
            }
            return entry.value
        },

        set(key, value, ttlSeconds) {
            // Re-inserting moves the key to the end of the Map's insertion order.
            entries.delete(key)

            if (entries.size >= maxEntries) evictExpired()
            if (entries.size >= maxEntries) {
                const oldest = entries.keys().next().value
                if (oldest !== undefined) entries.delete(oldest)
            }

            entries.set(key, { value, expiresAt: now() + ttlSeconds * 1000 })
        },

        delete(key) {
            entries.delete(key)
        },

        clear() {
            entries.clear()
        },

        get size() {
            return entries.size
        },
    }
}

/** Rebuilds a value with every object's keys sorted, so equal content serialises identically. */
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize)

    if (value !== null && typeof value === 'object') {
        const source = value as Record<string, unknown>
        const sorted: Record<string, unknown> = {}
        for (const key of Object.keys(source).sort()) {
            sorted[key] = canonicalize(source[key])
        }
        return sorted
    }

    return value
}

/** Deterministic digest of a JSON-compatible value, independent of object key order. */
export function stableHash(value: unknown): string {
    const canonical = JSON.stringify(canonicalize(value)) ?? 'undefined'
    return new Bun.CryptoHasher('sha256').update(canonical).digest('hex')
}

export interface WidgetCacheKeyParts {
    serviceId: string
    widgetId: string
    /** Must be the validated params: defaults applied, integers coerced. */
    params: WidgetParams
    /**
     * Set for authenticated services, so users with different credentials
     * never share an entry. The id, never the credentials themselves: secrets
     * must not end up in cache keys.
     */
    subscriptionId?: string
}

/**
 * Callers pass named parts and never assemble the key themselves. Without a
 * `subscriptionId` the key is unchanged from the unauthenticated format.
 */
export function buildWidgetCacheKey(parts: WidgetCacheKeyParts): string {
    const segments = [parts.serviceId, parts.widgetId, stableHash(parts.params)]
    if (parts.subscriptionId !== undefined) segments.push(parts.subscriptionId)
    return segments.map(encodeURIComponent).join(':')
}