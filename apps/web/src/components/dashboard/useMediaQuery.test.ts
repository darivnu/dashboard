import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

// jsdom has no matchMedia. This stand-in answers with `matches` and lets a
// test change the answer later, the way a browser does when the window is
// resized across the breakpoint.
function stubMatchMedia(matches: boolean) {
    const listeners = new Set<() => void>()
    const list = {
        matches,
        addEventListener: vi.fn((_type: string, listener: () => void) =>
            listeners.add(listener),
        ),
        removeEventListener: vi.fn((_type: string, listener: () => void) =>
            listeners.delete(listener),
        ),
    }
    const matchMedia = vi.fn((_query: string) => list)
    vi.stubGlobal('matchMedia', matchMedia)
    return {
        matchMedia,
        list,
        listeners,
        change(next: boolean) {
            list.matches = next
            for (const listener of listeners) listener()
        },
    }
}

test('is true when the query matches', () => {
    const { matchMedia } = stubMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(min-width: 48rem)'))
    expect(result.current).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 48rem)')
})

test('is false when the query does not match', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 48rem)'))
    expect(result.current).toBe(false)
})

test('follows the query when the answer changes', () => {
    const media = stubMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 48rem)'))

    act(() => media.change(true))
    expect(result.current).toBe(true)

    act(() => media.change(false))
    expect(result.current).toBe(false)
})

test('stops listening when the component goes away', () => {
    const media = stubMatchMedia(true)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 48rem)'))
    expect(media.list.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
    )

    unmount()
    expect(media.listeners.size).toBe(0)
})
