import { buildWidgetCacheKey } from '../../lib/cache'
import type { TtlCache } from '../../lib/cache'
import { AppError } from '../../lib/errors'
import { validateParams } from '../../services/params'
import { registry } from '../../services/registry'
import { WidgetFetchError } from '../../services/types'
import type { FetchCtx, HttpClient, ServiceAuth, WidgetFetchErrorCode } from '../../services/types'
import type { TokenManager } from '../../services/oauth/tokens'
import type { ServiceSubscriptionInstance, ServiceSubscriptionRepo } from '../subscriptions/subscriptions.repo'
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
    /** Only the two methods used here, so tests can pass a minimal fake. */
    subscriptions: Pick<ServiceSubscriptionRepo, 'find' | 'setStatus'>
    http: HttpClient
    /** Gives oauth2 widgets their access token (refreshing it when needed). */
    tokens: Pick<TokenManager, 'getAccessToken'>
    cache: TtlCache<CachedWidgetData>
    /** Injectable so tests can assert on fetchedAt. */
    now?: () => Date
}

export function createDataService(deps: DataServiceDeps) {
    const { repo, subscriptions, http, tokens, cache } = deps
    const now = deps.now ?? (() => new Date())

    /**
     * The upstream rejected the stored credential: remember it so later
     * requests skip fetch() until the user stores a new one (upsert sets the
     * status back to 'active'). A DB failure here must not hide the
     * needs_reauth result, so it is only logged.
     */
    async function markNeedsReauth(userId: string, serviceId: string): Promise<void> {
        try {
            await subscriptions.setStatus(userId, serviceId, 'needs_reauth')
        } catch (error) {
            console.error(`Could not flag the ${serviceId} subscription as needs_reauth`, error)
        }
    }

    //what the widget gets depends on the auth kind: nothing extra, its stored apiKey fields,
    //or a way to get an OAuth token. The token itself is only fetched if the widget asks for it
    function buildCtx(auth: ServiceAuth, subscription: ServiceSubscriptionInstance | undefined): FetchCtx {
        if (!subscription) return { http }
        if (auth.kind === 'oauth2') {
            const provider = auth.provider
            return { http, getAccessToken: () => tokens.getAccessToken(subscription, provider) }
        }
        // The cast is safe: subscribe() validated the credentials against
        // service.auth.fields, which only allows string and integer values.
        return { http, credentials: subscription.credentials as Record<string, string | number> }
    }

    return {
        async getInstanceData(userId: string, id: string): Promise<WidgetDataResult> {
            const instance = await repo.findByIdAndUser(id, userId)
            if (!instance) throw new AppError(404, 'NOT_FOUND', 'Widget instance not found')

            const service = registry.getService(instance.serviceId)
            const widget = registry.getWidget(instance.serviceId, instance.widgetId)
            if (!service || !widget) return { ok: false, code: 'invalid_config' }

            //checked before the cache, so unsubscribing or a rejected key takes
            //effect immediately instead of after the cached entry expires.
            let subscription: ServiceSubscriptionInstance | undefined
            if (service.auth.kind !== 'none') {
                subscription = await subscriptions.find(userId, service.id)
                if (!subscription || subscription.status !== 'active') return { ok: false, code: 'needs_reauth' }
            }

            try {
                const params = validateParams(widget.params, instance.params)
                const key = buildWidgetCacheKey({
                    serviceId: service.id,
                    widgetId: widget.id,
                    params,
                    subscriptionId: subscription?.id,
                })

                const cached = cache.get(key)
                if (cached) return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt }

                const ctx = buildCtx(service.auth, subscription)

                const data = await widget.fetch(ctx, params)
                const fetchedAt = now()
                cache.set(key, { data, fetchedAt }, widget.refresh.min)

                return { ok: true, data, fetchedAt }
            } catch (error) {
                if (error instanceof WidgetFetchError) {
                    if (error.code === 'needs_reauth' && subscription) await markNeedsReauth(userId, service.id)
                    return { ok: false, code: error.code }
                }

                console.error(`Widget ${service.id}/${widget.id} failed unexpectedly`, error)
                return { ok: false, code: 'upstream_error' }
            }
        },
    }
}

export type DataService = ReturnType<typeof createDataService>