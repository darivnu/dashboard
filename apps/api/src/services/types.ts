import type { OAuthProviderId } from './oauth/ids'

interface ParamDefBase {
    name: string
    label: string
    required?: boolean
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
 */
export interface OAuthCredentials {
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

export type ServiceAuth =
    | { kind: 'none' }
    | { kind: 'apiKey'; fields: ParamDef[] }
    | { kind: 'oauth2'; provider: OAuthProviderId; scopes: string[] }

export interface ServiceDef {
    id: string
    name: string
    auth: ServiceAuth
    widgets: WidgetDef[]
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