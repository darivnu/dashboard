interface ParamDefBase {
    name: string
    label: string
    required?: boolean
}

export type ParamDef =
    | (ParamDefBase & { type: 'string'; default?: string })
    | (ParamDefBase & { type: 'integer'; default?: number })

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
 * Additive by design: a later phase adds `credentials` (the service's
 * stored auth config) and `getAccessToken()` (for oauth2 services) as
 * further optional fields, without breaking this shape.
 */
export interface FetchCtx {
    http: HttpClient
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
    | { kind: 'oauth2'; provider: string; scopes: string[] }

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
