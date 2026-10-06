import type { OAuthProviderId } from './oauth/ids'

interface ParamDefBase {
    name: string
    label: string
    required?: boolean
    /**
     * Keeps the param out of the configuration form. For a value the widget
     * writes by itself (a choice made inside it) rather than one the user
     * types: it is still validated and stored like any other param, and the
     * catalog still lists it, flagged, so a form knows to skip it. A hidden
     * param cannot be required without a default, since nobody could fill it.
     */
    hidden?: boolean
}

interface IntegerParamDef extends ParamDefBase {
    type: 'integer'
    default?: number
    /**
     * Inclusive bounds. Each one is optional and enforced on its own side:
     * a param may declare only `min`, only `max`, both or neither.
     *
     * Declared once here, they drive three things: `validateParams` rejects a
     * value outside the range, the registry checks at boot that they are
     * integers, that `min <= max` and that `default` sits inside the range,
     * and the catalog publishes them so a form can enforce the same range.
     */
    min?: number
    max?: number
}

export type ParamDef =
    | (ParamDefBase & { type: 'string'; default?: string })
    | IntegerParamDef

export type ParamType = ParamDef['type']

export type WidgetParams = Record<string, string | number>

export interface WidgetRefresh {
    default: number
    min: number
}

export interface HttpClient {
    json<T = unknown>(url: string, init?: RequestInit): Promise<T>
    text(url: string, init?: RequestInit): Promise<string>
}

/**
 * Context for fetching widget data.
 *
 * Additive by design: each auth kind only adds the optional field it needs.
 */
export interface FetchCtx {
    http: HttpClient
    /**
     * The user's stored credentials for an apiKey service, keyed by the names
     * in "auth.fields". Absent for "auth.kind === 'none'".
     */
    credentials?: Record<string, string | number> //the question mark is because this is only present for apiKey services, not oauth2 or none
    /**
     * Returns a valid access token for the user's account at the provider,
     * refreshing it first when it is about to expire. Only present for
     * "auth.kind === 'oauth2'". Throws a WidgetFetchError ('needs_reauth' when
     * the user has to connect again), so a widget can just let it bubble up.
     */
    getAccessToken?: () => Promise<string>
}

/**
 * What an oauth2 subscription keeps in its (encrypted) `credentials` column.
 * `expiresAt` is an ISO date, or null for tokens that never expire (GitHub
 * OAuth App tokens). `refreshToken` is null when the provider gave none.
 * A `type` rather than an `interface` so it fits the column's generic
 * `Record<string, unknown>` (interfaces have no implicit index signature).
 */
export type OAuthCredentials = {
    accessToken: string
    refreshToken: string | null
    expiresAt: string | null
    scopes: string[]
}

export interface WidgetDef {
    id: string
    name: string
    description: string
    params: ParamDef[]
    refresh: WidgetRefresh
    fetch(ctx: FetchCtx, params: WidgetParams): Promise<unknown>
}

export interface ActionRateLimit {
    /** Calls allowed per window, per user and per action. Integer >= 1. */
    max: number
    /** Length of the window in seconds. Integer >= 1. */
    windowSeconds: number
}

/**
 * Something a user triggers on demand (report a play, star a repository),
 * as opposed to a widget, which is fetched on a timer.
 *
 * Every action is run by the same route,
 * POST /api/services/:serviceId/actions/:actionId, so declaring one here is
 * all it takes. `params` follow the same rules as widget params and are
 * validated before run(). Without `rateLimit` the action is not limited.
 * The result of run() is never cached.
 */
export interface ActionDef {
    id: string
    name: string
    description: string
    params: ParamDef[]
    rateLimit?: ActionRateLimit
    run(ctx: FetchCtx, params: WidgetParams): Promise<unknown>
}

export type ServiceAuth =
    | { kind: 'none' }
    | { kind: 'apiKey'; fields: ParamDef[] }
    | { kind: 'oauth2'; provider: OAuthProviderId; scopes: string[] }

export interface ServiceDef {
    id: string
    name: string
    auth: ServiceAuth
    widgets: WidgetDef[]
    actions?: ActionDef[]
}

export type WidgetFetchErrorCode =
    | 'needs_reauth'
    | 'rate_limited'
    | 'upstream_error'
    | 'invalid_config'

export class WidgetFetchError extends Error {
    constructor(
        public readonly code: WidgetFetchErrorCode,
        message: string,
        options?: { cause?: unknown },
    ) {
        super(message, options)
        this.name = 'WidgetFetchError'
    }
}