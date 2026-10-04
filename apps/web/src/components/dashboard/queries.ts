import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import type {
    CreateInstanceBody,
    Instance,
    InstanceParams,
    LayoutItem,
    UpdateInstanceBody,
} from './types'

export class ApiError extends Error {
    status: number
    code: string

    constructor(status: number, code: string, message: string) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.code = code
    }
}

type EdenResult<T> =
    | { data: T; error: null }
    | { data: null; error: { status: unknown; value: unknown } }

export function unwrap<T>(result: EdenResult<T>): T {
    if (result.error) {
        const { status, value } = result.error
        const body: { error?: unknown; message?: unknown } =
            typeof value === 'object' && value !== null ? value : {}
        throw new ApiError(
            Number(status),
            typeof body.error === 'string' ? body.error : 'UNKNOWN',
            typeof body.message === 'string'
                ? body.message
                : 'The request failed.',
        )
    }
    return result.data
}

export function errorMessage(error: unknown) {
    if (error instanceof ApiError) return error.message
    return "Couldn't reach the dashboard server."
}

export const queryKeys = {
    instances: ['instances'] as const,
    catalog: ['catalog'] as const,
    widgetData: (id: string) => ['widget-data', id] as const,
}

export function useInstances() {
    return useQuery({
        queryKey: queryKeys.instances,
        queryFn: async () =>
            unwrap(await api.dashboard.instances.get()).instances,
    })
}

export function useCatalog() {
    return useQuery({
        queryKey: queryKeys.catalog,
        queryFn: async () => unwrap(await api.catalog.get()).services,
    })
}

export function useCreateInstance() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (body: CreateInstanceBody) =>
            unwrap(await api.dashboard.instances.post(body)),
        onSuccess: (created) => {
            client.setQueryData<Instance[]>(queryKeys.instances, (old = []) => [
                ...old,
                created,
            ])
        },
    })
}

export function useUpdateInstance() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: { id: string; body: UpdateInstanceBody }) =>
            unwrap(
                await api.dashboard
                    .instances({ id: input.id })
                    .patch(input.body),
            ),
        onSuccess: (updated) => {
            client.setQueryData<Instance[]>(queryKeys.instances, (old = []) =>
                old.map((instance) =>
                    instance.id === updated.id ? updated : instance,
                ),
            )
            client.invalidateQueries({
                queryKey: queryKeys.widgetData(updated.id),
            })
        },
    })
}

export function useDeleteInstance() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (id: string) => {
            unwrap(await api.dashboard.instances({ id }).delete())
            return id
        },
        onSuccess: (id) => {
            client.setQueryData<Instance[]>(queryKeys.instances, (old = []) =>
                old.filter((instance) => instance.id !== id),
            )
            client.removeQueries({ queryKey: queryKeys.widgetData(id) })
        },
    })
}

export function useSaveLayout() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (items: LayoutItem[]) =>
            unwrap(await api.dashboard.layout.patch(items)).instances,
        onMutate: async (items) => {
            await client.cancelQueries({ queryKey: queryKeys.instances })
            const previous = client.getQueryData<Instance[]>(
                queryKeys.instances,
            )
            const moved = new Map(items.map((item) => [item.id, item]))
            client.setQueryData<Instance[]>(queryKeys.instances, (old = []) =>
                old.map((instance) => ({
                    ...instance,
                    ...moved.get(instance.id),
                })),
            )
            return { previous }
        },
        onError: (_error, _items, context) => {
            client.setQueryData(queryKeys.instances, context?.previous)
        },
        onSuccess: (instances) => {
            client.setQueryData(queryKeys.instances, instances)
        },
    })
}

export function useSetApiKey() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (input: {
            serviceId: string
            credentials: InstanceParams
        }) =>
            unwrap(
                await api
                    .subscriptions({ service: input.serviceId })
                    .post(input.credentials),
            ),
        onSuccess: (_subscription, { serviceId }) => {
            // The catalog carries the subscription status.
            client.invalidateQueries({ queryKey: queryKeys.catalog })
            // The key is shared by every widget of the service, and widget
            // data does not retry, so refetch them all now.
            const instances =
                client.getQueryData<Instance[]>(queryKeys.instances) ?? []
            for (const instance of instances) {
                if (instance.serviceId !== serviceId) continue
                client.invalidateQueries({
                    queryKey: queryKeys.widgetData(instance.id),
                })
            }
        },
    })
}
