import type { HttpClient } from '../services/types'
import { WidgetFetchError } from '../services/types'

const TIMEOUT_MS = 10_000

function codeForStatus(status: number): 'rate_limited' | 'needs_reauth' | 'upstream_error' {
    if (status === 429) return 'rate_limited'
    if (status === 401 || status === 403) return 'needs_reauth'
    return 'upstream_error'
}

export const httpClient: HttpClient = {
    async json<T = unknown>(url: string, init?: RequestInit): Promise<T> {
        let response: Response
        try {
            response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
        } catch (cause) {
            throw new WidgetFetchError('upstream_error', `Request to ${url} failed`, { cause })
        }

        if (!response.ok) {
            throw new WidgetFetchError(
                codeForStatus(response.status),
                `Request to ${url} failed with status ${response.status}`,
            )
        }

        try {
            return (await response.json()) as T
        } catch (cause) {
            throw new WidgetFetchError('upstream_error', `Response from ${url} was not valid JSON`, { cause })
        }
    },
}
