import { useQuery } from '@tanstack/react-query'
import { api } from '../../api'
import { queryKeys, unwrap } from './queries'
import type { Instance, WidgetErrorCode } from './types'

export type WidgetError =
    | { kind: 'service'; code: WidgetErrorCode }
    | { kind: 'network' }

class ServiceError extends Error {
    code: WidgetErrorCode

    constructor(code: WidgetErrorCode) {
        super(code)
        this.name = 'ServiceError'
        this.code = code
    }
}

async function fetchWidgetData(id: string) {
    const body = unwrap(await api.dashboard.instances({ id }).data.get())
    if (!body.ok) throw new ServiceError(body.code)
    return { data: body.data, fetchedAt: new Date(body.fetchedAt) }
}

function toWidgetError(error: Error | null): WidgetError | null {
    if (!error) return null
    if (error instanceof ServiceError) {
        return { kind: 'service', code: error.code }
    }
    return { kind: 'network' }
}

export function useWidgetData(
    instance: Pick<Instance, 'id' | 'refreshSeconds'>,
) {
    const query = useQuery({
        queryKey: queryKeys.widgetData(instance.id),
        queryFn: () => fetchWidgetData(instance.id),
        refetchInterval: instance.refreshSeconds * 1000,
        retry: false,
    })
    const hasData = query.data !== undefined

    return {
        data: query.data?.data,
        fetchedAt: query.data?.fetchedAt ?? null,
        error: toWidgetError(query.error),
        isLoading: query.isFetching && !hasData,
        isRefreshing: query.isFetching && hasData,
        refresh: () => {
            query.refetch()
        },
    }
}
