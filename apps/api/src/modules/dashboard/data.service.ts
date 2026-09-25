import { buildWidgetCacheKey } from '../../lib/cache'
import type { TtlCache } from '../../lib/cache'
import { AppError } from '../../lib/errors'
import { validateParams } from '../../services/params'
import { registry } from '../../services/registry'
import { WidgetFetchError } from '../../services/types'
import type { HttpClient, WidgetFetchErrorCode } from '../../services/types'
import type { DashboardRepo } from './dashboard.repo'

export interface CachedWidgetData {
    data: unknown
    fetchedAt: Date
}

export type WidgetDataResult =
    | { ok: true; data: unknown; fetchedAt: Date }
    | { ok: false; code: WidgetFetchErrorCode }

export interface DataServiceDeps {
    repo: DashboardRepo
    http: HttpClient
    cache: TtlCache<CachedWidgetData>
    /** Injectable so tests can assert on fetchedAt. */
    now?: () => Date
}

export function createDataService(deps: DataServiceDeps) {
    const { repo, http, cache } = deps
    const now = deps.now ?? (() => new Date())

    return {
        async getInstanceData(userId: string, id: string): Promise<WidgetDataResult> {
            const instance = await repo.findByIdAndUser(id, userId)
            if (!instance) throw new AppError(404, 'NOT_FOUND', 'Widget instance not found')

            const service = registry.getService(instance.serviceId)
            const widget = registry.getWidget(instance.serviceId, instance.widgetId)
            if (!service || !widget) return { ok: false, code: 'invalid_config' }

            // Credentials and subscriptions do not exist yet.
            if (service.auth.kind !== 'none') return { ok: false, code: 'needs_reauth' }

            try {
                const params = validateParams(widget.params, instance.params)
                const key = buildWidgetCacheKey({ serviceId: service.id, widgetId: widget.id, params })

                const cached = cache.get(key)
                if (cached) return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt }

                const data = await widget.fetch({ http }, params)
                const fetchedAt = now()
                cache.set(key, { data, fetchedAt }, widget.refresh.min)

                return { ok: true, data, fetchedAt }
            } catch (error) {
                if (error instanceof WidgetFetchError) return { ok: false, code: error.code }

                console.error(`Widget ${service.id}/${widget.id} failed unexpectedly`, error)
                return { ok: false, code: 'upstream_error' }
            }
        },
    }
}

export type DataService = ReturnType<typeof createDataService>