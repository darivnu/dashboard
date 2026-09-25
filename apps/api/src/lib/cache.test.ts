import { describe, expect, test } from 'bun:test'
import { buildWidgetCacheKey, createTtlCache, stableHash } from './cache'

/** A cache whose clock only moves when the test says so. */
function cacheWithClock(maxEntries?: number) {
    const clock = { ms: 0 }
    const cache = createTtlCache<string>({ now: () => clock.ms, maxEntries })
    return { cache, clock }
}

describe('createTtlCache', () => {
    test('returns undefined for a key that was never stored', () => {
        const { cache } = cacheWithClock()

        expect(cache.get('missing')).toBeUndefined()
    })

    test('returns the stored value until the ttl has passed', () => {
        const { cache, clock } = cacheWithClock()
        cache.set('paris', 'sunny', 10)

        clock.ms = 9_999
        expect(cache.get('paris')).toBe('sunny')
    })

    test('forgets the value once the ttl has passed', () => {
        const { cache, clock } = cacheWithClock()
        cache.set('paris', 'sunny', 10)

        clock.ms = 10_000
        expect(cache.get('paris')).toBeUndefined()
        expect(cache.size).toBe(0)
    })

    test('gives each entry its own ttl', () => {
        const { cache, clock } = cacheWithClock()
        cache.set('short', 'a', 5)
        cache.set('long', 'b', 50)

        clock.ms = 6_000
        expect(cache.get('short')).toBeUndefined()
        expect(cache.get('long')).toBe('b')
    })

    test('delete and clear remove entries', () => {
        const { cache } = cacheWithClock()
        cache.set('a', '1', 10)
        cache.set('b', '2', 10)

        cache.delete('a')
        expect(cache.get('a')).toBeUndefined()
        expect(cache.get('b')).toBe('2')

        cache.clear()
        expect(cache.size).toBe(0)
    })

    test('when full, drops expired entries before live ones', () => {
        const { cache, clock } = cacheWithClock(2)
        cache.set('dead', 'x', 1)
        cache.set('alive', 'y', 100)

        clock.ms = 2_000
        cache.set('new', 'z', 100)

        expect(cache.get('alive')).toBe('y')
        expect(cache.get('new')).toBe('z')
        expect(cache.size).toBe(2)
    })

    test('when full of live entries, drops the oldest write', () => {
        const { cache } = cacheWithClock(2)
        cache.set('a', '1', 100)
        cache.set('b', '2', 100)
        cache.set('a', '1 again', 100)

        cache.set('c', '3', 100)

        expect(cache.get('b')).toBeUndefined()
        expect(cache.get('a')).toBe('1 again')
        expect(cache.get('c')).toBe('3')
    })
})

describe('stableHash', () => {
    test('ignores the order of object keys, at any depth', () => {
        const one = { city: 'Paris', options: { days: 3, units: 'metric' } }
        const two = { options: { units: 'metric', days: 3 }, city: 'Paris' }

        expect(stableHash(one)).toBe(stableHash(two))
    })

    test('changes when a value changes', () => {
        expect(stableHash({ city: 'Paris' })).not.toBe(stableHash({ city: 'Rome' }))
    })

    test('tells the number 3 from the string "3"', () => {
        expect(stableHash({ days: 3 })).not.toBe(stableHash({ days: '3' }))
    })

    test('keeps the order of arrays significant', () => {
        expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]))
    })
})

describe('buildWidgetCacheKey', () => {
    const base = { serviceId: 'weather', widgetId: 'forecast', params: { city: 'Paris', days: 3 } }

    test('is the same for the same params in a different order', () => {
        const reordered = { ...base, params: { days: 3, city: 'Paris' } }

        expect(buildWidgetCacheKey(reordered)).toBe(buildWidgetCacheKey(base))
    })

    test('differs when the params, the widget or the service differ', () => {
        const key = buildWidgetCacheKey(base)

        expect(buildWidgetCacheKey({ ...base, params: { city: 'Rome', days: 3 } })).not.toBe(key)
        expect(buildWidgetCacheKey({ ...base, widgetId: 'air-quality' })).not.toBe(key)
        expect(buildWidgetCacheKey({ ...base, serviceId: 'other-weather' })).not.toBe(key)
    })

    test('cannot be confused by a separator inside an id', () => {
        const one = buildWidgetCacheKey({ serviceId: 'a:b', widgetId: 'c', params: {} })
        const two = buildWidgetCacheKey({ serviceId: 'a', widgetId: 'b:c', params: {} })

        expect(one).not.toBe(two)
    })
})
