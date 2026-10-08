import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getTextSizePreference, setTextSizePreference } from './textSize'

const KEY = 'dashboard.textSize'
const ATTR = 'data-text-size'

beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute(ATTR)
    vi.restoreAllMocks()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('getTextSizePreference', () => {
    test('defaults to "default" when nothing is stored', () => {
        expect(getTextSizePreference()).toBe('default')
    })

    test('returns the stored size when it is an allowed one', () => {
        localStorage.setItem(KEY, 'large')
        expect(getTextSizePreference()).toBe('large')
    })

    test('falls back to "default" on an unknown stored value', () => {
        localStorage.setItem(KEY, 'gigantic')
        expect(getTextSizePreference()).toBe('default')
    })

    test('falls back to "default" when localStorage throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked')
        })
        expect(getTextSizePreference()).toBe('default')
    })
})

describe('setTextSizePreference', () => {
    test('stores the size and sets data-text-size on <html>', () => {
        setTextSizePreference('xlarge')

        expect(localStorage.getItem(KEY)).toBe('xlarge')
        expect(document.documentElement.getAttribute(ATTR)).toBe('xlarge')
        expect(getTextSizePreference()).toBe('xlarge')
    })

    test('still sets the attribute for this page when localStorage throws', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked')
        })

        expect(() => setTextSizePreference('small')).not.toThrow()
        expect(document.documentElement.getAttribute(ATTR)).toBe('small')
    })
})
