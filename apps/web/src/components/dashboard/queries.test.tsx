import { act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
    apiMock,
    fail,
    makeInstance,
    ok,
    resetApiMock,
} from '../../test/apiMock'
import {
    createTestQueryClient,
    renderHookWithQuery,
} from '../../test/renderWithQuery'
import {
    ApiError,
    errorMessage,
    queryKeys,
    unwrap,
    useCatalog,
    useCreateInstance,
    useDeleteInstance,
    useInstances,
    useSaveLayout,
    useUpdateInstance,
} from './queries'

vi.mock('../../api', async () => (await import('../../test/apiMock')).apiModule)

beforeEach(() => {
    resetApiMock()
})

describe('unwrap', () => {
    test('gives back the data of a successful call', () => {
        expect(unwrap(ok({ instances: [] }))).toEqual({ instances: [] })
    })

    test('throws an ApiError carrying the server status, code and message', () => {
        const call = () =>
            unwrap(fail(400, 'INVALID_PARAMS', '/limit: must be <= 500'))
        expect(call).toThrow(ApiError)
        try {
            call()
        } catch (error) {
            expect(error).toMatchObject({
                status: 400,
                code: 'INVALID_PARAMS',
                message: '/limit: must be <= 500',
            })
        }
    })

    test('copes with an error body that is not the usual envelope', () => {
        const call = () =>
            unwrap({ data: null, error: { status: 502, value: 'Bad Gateway' } })
        expect(call).toThrow(ApiError)
        try {
            call()
        } catch (error) {
            expect(error).toMatchObject({ status: 502, code: 'UNKNOWN' })
        }
    })
})

describe('errorMessage', () => {
    test('uses the server message for an ApiError', () => {
        expect(
            errorMessage(new ApiError(400, 'REFRESH_TOO_LOW', 'Too low')),
        ).toBe('Too low')
    })

    test('anything else means the server could not be reached', () => {
        expect(errorMessage(new TypeError('Failed to fetch'))).toBe(
            "Couldn't reach the dashboard server.",
        )
    })
})

describe('useInstances', () => {
    test('loads the list of instances', async () => {
        const instances = [makeInstance(), makeInstance()]
        apiMock.listInstances.mockResolvedValue(ok({ instances }))

        const { result } = renderHookWithQuery(() => useInstances())

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual(instances)
    })

    test('reports a server rejection as an ApiError', async () => {
        apiMock.listInstances.mockResolvedValue(
            fail(401, 'UNAUTHORIZED', 'Authentication required'),
        )

        const { result } = renderHookWithQuery(() => useInstances())

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(result.current.error).toBeInstanceOf(ApiError)
    })

    test('reports a network failure', async () => {
        apiMock.listInstances.mockRejectedValue(
            new TypeError('Failed to fetch'),
        )

        const { result } = renderHookWithQuery(() => useInstances())

        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(errorMessage(result.current.error)).toBe(
            "Couldn't reach the dashboard server.",
        )
    })
})

describe('useCatalog', () => {
    test('loads the list of services', async () => {
        const services = [{ id: 'mock', name: 'Mock', widgets: [] }]
        apiMock.catalog.mockResolvedValue(ok({ services }))

        const { result } = renderHookWithQuery(() => useCatalog())

        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(result.current.data).toEqual(services)
    })
})

describe('useCreateInstance', () => {
    test('posts the body and adds the new instance to the cached list', async () => {
        const existing = makeInstance()
        const created = makeInstance({ x: 4 })
        apiMock.createInstance.mockResolvedValue(ok(created))
        const client = createTestQueryClient()
        client.setQueryData(queryKeys.instances, [existing])

        const { result } = renderHookWithQuery(
            () => useCreateInstance(),
            client,
        )
        const body = { serviceId: 'mock', widgetId: 'echo', x: 4, y: 0 }
        await act(() => result.current.mutateAsync(body))

        expect(apiMock.createInstance).toHaveBeenCalledWith(body)
        expect(client.getQueryData(queryKeys.instances)).toEqual([
            existing,
            created,
        ])
    })

    test('a rejection is thrown as an ApiError and the list is untouched', async () => {
        apiMock.createInstance.mockResolvedValue(
            fail(400, 'INVALID_PARAMS', '/limit: must be <= 500'),
        )
        const client = createTestQueryClient()
        client.setQueryData(queryKeys.instances, [])

        const { result } = renderHookWithQuery(
            () => useCreateInstance(),
            client,
        )
        await act(async () => {
            await expect(
                result.current.mutateAsync({
                    serviceId: 'radio_browser',
                    widgetId: 'station_map',
                }),
            ).rejects.toMatchObject({ message: '/limit: must be <= 500' })
        })

        expect(client.getQueryData(queryKeys.instances)).toEqual([])
    })
})

describe('useUpdateInstance', () => {
    test('patches that instance, replaces it in the list and refetches its data', async () => {
        const other = makeInstance()
        const before = makeInstance({ title: 'Old' })
        const after = { ...before, title: 'New' }
        apiMock.updateInstance.mockResolvedValue(ok(after))
        const client = createTestQueryClient()
        client.setQueryData(queryKeys.instances, [other, before])
        client.setQueryData(queryKeys.widgetData(before.id), { stale: true })
        const invalidate = vi.spyOn(client, 'invalidateQueries')

        const { result } = renderHookWithQuery(
            () => useUpdateInstance(),
            client,
        )
        await act(() =>
            result.current.mutateAsync({
                id: before.id,
                body: { title: 'New' },
            }),
        )

        expect(apiMock.instanceById).toHaveBeenCalledWith({ id: before.id })
        expect(apiMock.updateInstance).toHaveBeenCalledWith({ title: 'New' })
        expect(client.getQueryData(queryKeys.instances)).toEqual([other, after])
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.widgetData(before.id),
        })
    })
})

describe('useDeleteInstance', () => {
    test('deletes that instance and drops it and its data from the cache', async () => {
        const keep = makeInstance()
        const gone = makeInstance()
        apiMock.deleteInstance.mockResolvedValue(ok({ ok: true }))
        const client = createTestQueryClient()
        client.setQueryData(queryKeys.instances, [keep, gone])
        client.setQueryData(queryKeys.widgetData(gone.id), { some: 'data' })

        const { result } = renderHookWithQuery(
            () => useDeleteInstance(),
            client,
        )
        await act(() => result.current.mutateAsync(gone.id))

        expect(apiMock.instanceById).toHaveBeenCalledWith({ id: gone.id })
        expect(client.getQueryData(queryKeys.instances)).toEqual([keep])
        expect(
            client.getQueryData(queryKeys.widgetData(gone.id)),
        ).toBeUndefined()
    })
})

describe('useSaveLayout', () => {
    test('shows the new positions at once, then keeps what the server returns', async () => {
        const a = makeInstance({ x: 0 })
        const b = makeInstance({ x: 4 })
        const client = createTestQueryClient()
        client.setQueryData(queryKeys.instances, [a, b])
        let respond: (value: unknown) => void = () => {}
        apiMock.saveLayout.mockReturnValue(
            new Promise((resolve) => {
                respond = resolve
            }),
        )

        const { result } = renderHookWithQuery(() => useSaveLayout(), client)
        const items = [
            { id: a.id, x: 4, y: 0, w: 4, h: 3 },
            { id: b.id, x: 0, y: 0, w: 4, h: 3 },
        ]
        act(() => {
            result.current.mutate(items)
        })

        // before the server has answered
        await waitFor(() =>
            expect(client.getQueryData(queryKeys.instances)).toEqual([
                { ...a, x: 4 },
                { ...b, x: 0 },
            ]),
        )
        expect(apiMock.saveLayout).toHaveBeenCalledWith(items)

        const fromServer = [
            { ...a, x: 4, updatedAt: new Date('2026-10-03T00:00:00Z') },
            { ...b, x: 0, updatedAt: new Date('2026-10-03T00:00:00Z') },
        ]
        await act(async () => {
            respond(ok({ instances: fromServer }))
        })
        await waitFor(() =>
            expect(client.getQueryData(queryKeys.instances)).toEqual(
                fromServer,
            ),
        )
    })

    test('puts the old positions back when the server refuses', async () => {
        const a = makeInstance({ x: 0 })
        const b = makeInstance({ x: 4 })
        const client = createTestQueryClient()
        client.setQueryData(queryKeys.instances, [a, b])
        apiMock.saveLayout.mockResolvedValue(
            fail(400, 'DUPLICATE_ID', 'Duplicate id'),
        )

        const { result } = renderHookWithQuery(() => useSaveLayout(), client)
        await act(async () => {
            await expect(
                result.current.mutateAsync([
                    { id: a.id, x: 4, y: 0, w: 4, h: 3 },
                ]),
            ).rejects.toBeInstanceOf(ApiError)
        })

        expect(client.getQueryData(queryKeys.instances)).toEqual([a, b])
    })
})
