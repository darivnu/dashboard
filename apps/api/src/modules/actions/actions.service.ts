import { t } from 'elysia'
import { Value } from '@sinclair/typebox/value'
import { AppError } from '../../lib/errors'
import type { FixedWindowLimiter } from '../../lib/rate-limit'
import { validateParams } from '../../services/params'
import { registry } from '../../services/registry'
import { WidgetFetchError } from '../../services/types'
import type { HttpClient, WidgetFetchErrorCode, WidgetParams } from '../../services/types'

/**
 * A 429 that also carries how long to wait, so the route can send
 * `Retry-After`. Still an AppError: the global error handler writes the usual
 * `{ error: 'RATE_LIMITED', message }` envelope.
 */
export class RateLimitedError extends AppError {
    constructor(public readonly retryAfterSeconds: number) {
        super(429, 'RATE_LIMITED', 'Too many requests, try again later')
        this.name = 'RateLimitedError'
    }
}

/**
 * The limits a widget instance's `params` have in dashboard.routes.ts. Checked
 * here and not by the route's body schema: Elysia turns a string or an array
 * into an object before validating it, so the route would let them through.
 */
const rawParamsSchema = t.Record(
    t.String({ maxLength: 64 }),
    t.Union([t.String({ maxLength: 500 }), t.Number()]),
    { maxProperties: 50 },
)

function assertParamsShape(rawParams: unknown): void {
    if (typeof rawParams !== 'object' || rawParams === null || Array.isArray(rawParams))
        throw new AppError(400, 'INVALID_PARAMS', 'params must be an object')
    if (!Value.Check(rawParamsSchema, rawParams))
        throw new AppError(400, 'INVALID_PARAMS', 'params must hold at most 50 values, each a number or a string of at most 500 characters')
}

/** `invalid_config` is never returned: it is the caller's mistake, so it is a 400. */
export type ActionResult =
    | { ok: true; data: unknown }
    | { ok: false; code: Exclude<WidgetFetchErrorCode, 'invalid_config'> }

export interface ActionsServiceDeps {
    http: HttpClient
    limiter: FixedWindowLimiter
}

export function createActionsService(deps: ActionsServiceDeps) {
    const { http, limiter } = deps

    //one counter per user, per service and per action: a user hammering one action
    //slows down neither another user nor their own other actions
    function limitKey(userId: string, serviceId: string, actionId: string): string {
        return [userId, serviceId, actionId].map(encodeURIComponent).join(':')
    }

    async function runAction(
        userId: string,
        serviceId: string,
        actionId: string,
        rawParams: unknown = {},
    ): Promise<ActionResult> {
        const service = registry.getService(serviceId)
        const action = registry.getAction(serviceId, actionId)
        if (!service || !action)
            throw new AppError(404, 'NOT_FOUND', 'Action not found')

        //counted before validation on purpose: a call with bad params is still a call
        if (action.rateLimit) {
            const { max, windowSeconds } = action.rateLimit
            const { limited, retryAfterSeconds } = limiter.hit(limitKey(userId, serviceId, actionId), max, windowSeconds)
            if (limited)
                throw new RateLimitedError(retryAfterSeconds)
        }

        assertParamsShape(rawParams)

        let params: WidgetParams
        try {
            params = validateParams(action.params, rawParams)
        } catch (error) {
            if (error instanceof WidgetFetchError)
                throw new AppError(400, 'INVALID_PARAMS', error.message)
            throw error
        }

        //actions of apiKey and oauth2 services get no credentials yet, so they cannot run
        if (service.auth.kind !== 'none')
            return { ok: false, code: 'needs_reauth' }

        try {
            const data = await action.run({ http }, params)
            // `undefined` would drop the key from the JSON answer.
            return { ok: true, data: data ?? null }
        } catch (error) {
            if (error instanceof WidgetFetchError) {
                if (error.code === 'invalid_config')
                    throw new AppError(400, 'INVALID_PARAMS', error.message)
                return { ok: false, code: error.code }
            }

            console.error(`Action ${serviceId}/${actionId} failed unexpectedly`, error)
            return { ok: false, code: 'upstream_error' }
        }
    }

    return { runAction }
}

export type ActionsService = ReturnType<typeof createActionsService>
