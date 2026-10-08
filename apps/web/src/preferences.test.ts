import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { readPreference, subscribe, writePreference } from './preferences'

const KEY = 'dashboard.theme'
const ATTR = 'data-theme'

beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute(ATTR)
    vi.restoreAllMocks()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('readPreference', () => {
    test('returns the fallback when nothing is stored', () => {
        expect(readPreference('theme')).toBe('dark')
    })

    test('returns the stored value when it is one of the allowed ones', () => {
        localStorage.setItem(KEY, 'light')
        expect(readPreference('theme')).toBe('light')
    })

    test('returns the fallback when the stored value is unknown', () => {
        localStorage.setItem(KEY, 'purple')
        expect(readPreference('theme')).toBe('dark')
    })

    test('returns the fallback when localStorage throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        expect(readPreference('theme')).toBe('dark')
    })
})

describe('writePreference', () => {
    test('stores the value, sets the attribute on <html> and notifies', () => {
        const listener = vi.fn()
        const unsubscribe = subscribe(listener)

        writePreference('theme', 'light')

        expect(localStorage.getItem(KEY)).toBe('light')
        expect(document.documentElement.getAttribute(ATTR)).toBe('light')
        expect(listener).toHaveBeenCalledTimes(1)

        unsubscribe()
    })

    test('still sets the attribute and notifies when localStorage throws', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        const listener = vi.fn()
        const unsubscribe = subscribe(listener)

        expect(() => writePreference('theme', 'light')).not.toThrow()

        expect(document.documentElement.getAttribute(ATTR)).toBe('light')
        expect(listener).toHaveBeenCalledTimes(1)

        unsubscribe()
    })

    test('a listener stops being called after it unsubscribes', () => {
        const listener = vi.fn()
        const unsubscribe = subscribe(listener)
        unsubscribe()

        writePreference('theme', 'light')

        expect(listener).not.toHaveBeenCalled()
    })
})
