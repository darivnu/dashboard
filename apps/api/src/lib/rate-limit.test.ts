import { describe, expect, test } from 'bun:test'
import { createFixedWindowLimiter } from './rate-limit'

// A clock the test moves by hand, so no test has to sleep.
function setup(options: { sweepAt?: number } = {}) {
    const clock = { ms: 0 }
    const limiter = createFixedWindowLimiter({ now: () => clock.ms, ...options })
    return { clock, limiter }
}

describe('createFixedWindowLimiter', () => {
    test('allows up to max hits in a window and limits the next one', () => {
        const { limiter } = setup()

        for (let i = 0; i < 3; i += 1) {
            expect(limiter.hit('key', 3, 60)).toEqual({ limited: false, retryAfterSeconds: 0 })
        }
        expect(limiter.hit('key', 3, 60).limited).toBe(true)
    })

    test('retryAfterSeconds is the time left in the window, rounded up', () => {
        const { clock, limiter } = setup()
        limiter.hit('key', 1, 60)

        clock.ms = 10_500

        expect(limiter.hit('key', 1, 60)).toEqual({ limited: true, retryAfterSeconds: 50 })
    })

    test('the window is fixed: later hits do not extend it', () => {
        const { clock, limiter } = setup()
        limiter.hit('key', 1, 60)

        clock.ms = 59_000
        expect(limiter.hit('key', 1, 60)).toEqual({ limited: true, retryAfterSeconds: 1 })

        clock.ms = 59_999
        expect(limiter.hit('key', 1, 60)).toEqual({ limited: true, retryAfterSeconds: 1 })
    })

    test('a hit at the instant the window ends opens a new window', () => {
        const { clock, limiter } = setup()
        limiter.hit('key', 1, 60)
        expect(limiter.hit('key', 1, 60).limited).toBe(true)

        clock.ms = 60_000

        expect(limiter.hit('key', 1, 60)).toEqual({ limited: false, retryAfterSeconds: 0 })
        expect(limiter.hit('key', 1, 60)).toEqual({ limited: true, retryAfterSeconds: 60 })
    })

    test('keys are counted independently', () => {
        const { limiter } = setup()
        limiter.hit('alice', 1, 60)

        expect(limiter.hit('alice', 1, 60).limited).toBe(true)
        expect(limiter.hit('bob', 1, 60).limited).toBe(false)
    })

    test('drops expired records once sweepAt keys are stored, and keeps open windows', () => {
        const { clock, limiter } = setup({ sweepAt: 3 })
        limiter.hit('a', 1, 10)
        limiter.hit('b', 1, 10)
        clock.ms = 5_000
        limiter.hit('c', 1, 10)
        expect(limiter.size).toBe(3)

        // a and b ended at 10 s; c is open until 15 s.
        clock.ms = 11_000
        limiter.hit('d', 1, 10)

        expect(limiter.size).toBe(2)
        expect(limiter.hit('c', 1, 10).limited).toBe(true)
    })

    test('does not sweep below sweepAt', () => {
        const { clock, limiter } = setup({ sweepAt: 10 })
        limiter.hit('a', 1, 10)
        clock.ms = 11_000
        limiter.hit('b', 1, 10)

        expect(limiter.size).toBe(2)
    })

    test('uses the real clock by default', () => {
        const limiter = createFixedWindowLimiter()
        limiter.hit('key', 1, 60)

        const { limited, retryAfterSeconds } = limiter.hit('key', 1, 60)

        expect(limited).toBe(true)
        expect(retryAfterSeconds).toBeGreaterThan(0)
        expect(retryAfterSeconds).toBeLessThanOrEqual(60)
    })
})
