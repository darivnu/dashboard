import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { apiMock, fail, ok, resetApiMock } from '../../test/apiMock'
import { renderHookWithQuery } from '../../test/renderWithQuery'
import { useWidgetData } from './useWidgetData'

vi.mock('../../api', async () => (await import('../../test/apiMock')).apiModule)

const instance = { id: 'widget-1', refreshSeconds: 60 }

function success(data: unknown, fetchedAt = '2026-10-03T14:32:00.000Z') {
    return ok({ ok: true, data, fetchedAt })
}

function failure(code: string) {
    return ok({ ok: false, code })
}

beforeEach(() => {
    resetApiMock()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('first load', () => {
    test('is loading, then exposes the data and when it was fetched', async () => {
        apiMock.instanceData.mockResolvedValue(success({ message: 'hi' }))

        const { result } = renderHookWithQuery(() => useWidgetData(instance))

        expect(result.current.isLoading).toBe(true)
        expect(result.current.data).toBeUndefined()
        expect(result.current.fetchedAt).toBeNull()

        await waitFor(() => expect(result.current.isLoading).toBe(false))
        expect(apiMock.instanceById).toHaveBeenCalledWith({ id: 'widget-1' })
        expect(result.current.data).toEqual({ message: 'hi' })
        expect(result.current.fetchedAt).toEqual(
            new Date('2026-10-03T14:32:00.000Z'),
        )
        expect(result.current.error).toBeNull()
        expect(result.current.isRefreshing).toBe(false)
    })

    test.each([
        'needs_reauth',
        'rate_limited',
        'upstream_error',
        'invalid_config',
    ])(
        'a { ok: false, code: %s } answer becomes a service error',
        async (code) => {
            apiMock.instanceData.mockResolvedValue(failure(code))

            const { result } = renderHookWithQuery(() =>
                useWidgetData(instance),
            )

            await waitFor(() =>
                expect(result.current.error).toEqual({ kind: 'service', code }),
            )
            expect(result.current.data).toBeUndefined()
            expect(result.current.isLoading).toBe(false)
        },
    )

    test('an HTTP failure becomes a network error', async () => {
        apiMock.instanceData.mockResolvedValue(
            fail(404, 'NOT_FOUND', 'Instance not found'),
        )

        const { result } = renderHookWithQuery(() => useWidgetData(instance))

        await waitFor(() =>
            expect(result.current.error).toEqual({ kind: 'network' }),
        )
    })

    test('a request that never gets an answer becomes a network error', async () => {
        apiMock.instanceData.mockRejectedValue(new TypeError('Failed to fetch'))

        const { result } = renderHookWithQuery(() => useWidgetData(instance))

        await waitFor(() =>
            expect(result.current.error).toEqual({ kind: 'network' }),
        )
    })
})

describe('refreshing', () => {
    test('refetches every refreshSeconds', async () => {
        vi.useFakeTimers()
        apiMock.instanceData.mockResolvedValue(success({ n: 1 }))

        renderHookWithQuery(() =>
            useWidgetData({ id: 'widget-1', refreshSeconds: 5 }),
        )
        await act(() => vi.advanceTimersByTimeAsync(0))
        expect(apiMock.instanceData).toHaveBeenCalledTimes(1)

        await act(() => vi.advanceTimersByTimeAsync(4_000))
        expect(apiMock.instanceData).toHaveBeenCalledTimes(1)

        await act(() => vi.advanceTimersByTimeAsync(1_000))
        expect(apiMock.instanceData).toHaveBeenCalledTimes(2)

        await act(() => vi.advanceTimersByTimeAsync(5_000))
        expect(apiMock.instanceData).toHaveBeenCalledTimes(3)
    })

    test('refresh() fetches again and shows the new data', async () => {
        apiMock.instanceData.mockResolvedValueOnce(success({ n: 1 }))
        const { result } = renderHookWithQuery(() => useWidgetData(instance))
        await waitFor(() => expect(result.current.data).toEqual({ n: 1 }))

        let respond: (value: unknown) => void = () => {}
        apiMock.instanceData.mockReturnValueOnce(
            new Promise((resolve) => {
                respond = resolve
            }),
        )
        act(() => {
            result.current.refresh()
        })

        // while the refresh is in flight the old data stays on screen
        await waitFor(() => expect(result.current.isRefreshing).toBe(true))
        expect(result.current.isLoading).toBe(false)
        expect(result.current.data).toEqual({ n: 1 })

        await act(async () => {
            respond(success({ n: 2 }, '2026-10-03T14:40:00.000Z'))
        })
        await waitFor(() => expect(result.current.data).toEqual({ n: 2 }))
        expect(result.current.isRefreshing).toBe(false)
        expect(result.current.fetchedAt).toEqual(
            new Date('2026-10-03T14:40:00.000Z'),
        )
    })

    test('a refresh that fails keeps the data and reports the error', async () => {
        apiMock.instanceData.mockResolvedValueOnce(success({ n: 1 }))
        const { result } = renderHookWithQuery(() => useWidgetData(instance))
        await waitFor(() => expect(result.current.data).toEqual({ n: 1 }))

        apiMock.instanceData.mockResolvedValueOnce(failure('rate_limited'))
        act(() => {
            result.current.refresh()
        })

        await waitFor(() =>
            expect(result.current.error).toEqual({
                kind: 'service',
                code: 'rate_limited',
            }),
        )
        expect(result.current.data).toEqual({ n: 1 })
        expect(result.current.fetchedAt).toEqual(
            new Date('2026-10-03T14:32:00.000Z'),
        )
    })

    test('a later success clears the error', async () => {
        apiMock.instanceData.mockResolvedValueOnce(failure('upstream_error'))
        const { result } = renderHookWithQuery(() => useWidgetData(instance))
        await waitFor(() => expect(result.current.error).not.toBeNull())

        apiMock.instanceData.mockResolvedValueOnce(success({ n: 1 }))
        act(() => {
            result.current.refresh()
        })

        // retrying after a first-load failure counts as loading again
        await waitFor(() => expect(result.current.data).toEqual({ n: 1 }))
        expect(result.current.error).toBeNull()
    })

    test('keeps retrying on its timer after a failure', async () => {
        vi.useFakeTimers()
        apiMock.instanceData.mockResolvedValueOnce(failure('rate_limited'))
        apiMock.instanceData.mockResolvedValueOnce(success({ n: 1 }))

        const { result } = renderHookWithQuery(() =>
            useWidgetData({ id: 'widget-1', refreshSeconds: 5 }),
        )
        await act(() => vi.advanceTimersByTimeAsync(0))
        expect(result.current.error).toEqual({
            kind: 'service',
            code: 'rate_limited',
        })

        // the timer fires at 5 s; the answer lands a moment later
        await act(() => vi.advanceTimersByTimeAsync(5_000))
        await act(() => vi.advanceTimersByTimeAsync(1))
        expect(apiMock.instanceData).toHaveBeenCalledTimes(2)
        expect(result.current.data).toEqual({ n: 1 })
        expect(result.current.error).toBeNull()
    })
})

test('each instance has its own data', async () => {
    apiMock.instanceById.mockImplementation(({ id }: { id: string }) => {
        apiMock.instanceData.mockResolvedValueOnce(success({ from: id }))
    })

    const first = renderHookWithQuery(() =>
        useWidgetData({ id: 'widget-1', refreshSeconds: 60 }),
    )
    await waitFor(() =>
        expect(first.result.current.data).toEqual({ from: 'widget-1' }),
    )
    const second = renderHookWithQuery(
        () => useWidgetData({ id: 'widget-2', refreshSeconds: 60 }),
        first.client,
    )
    await waitFor(() =>
        expect(second.result.current.data).toEqual({ from: 'widget-2' }),
    )
    expect(first.result.current.data).toEqual({ from: 'widget-1' })
})
