import { isOAuthProviderId } from './oauth/ids'
import type { ActionDef, ActionRateLimit, ParamDef, ServiceDef, WidgetDef, WidgetRefresh } from './types'

const services = new Map<string, ServiceDef>()

function assertUniqueParams(scope: string, params: ParamDef[]): void {
    const seen = new Set<string>()
    for (const param of params) {
        if (seen.has(param.name)) {
            throw new Error(`${scope}: duplicate param "${param.name}"`)
        }
        seen.add(param.name)
    }
}

function assertValidBounds(scope: string, params: ParamDef[]): void {
    for (const param of params) {
        if (param.type !== 'integer') continue

        const { name, min, max } = param
        const where = `${scope}: param "${name}"`

        if (min !== undefined && !Number.isInteger(min)) {
            throw new Error(`${where} min must be an integer, got ${min}`)
        }
        if (max !== undefined && !Number.isInteger(max)) {
            throw new Error(`${where} max must be an integer, got ${max}`)
        }
        if (min !== undefined && max !== undefined && min > max) {
            throw new Error(`${where} min (${min}) must be <= max (${max})`)
        }

        if (param.default === undefined) continue

        if (min !== undefined && param.default < min) {
            throw new Error(`${where} default (${param.default}) must be >= min (${min})`)
        }
        if (max !== undefined && param.default > max) {
            throw new Error(`${where} default (${param.default}) must be <= max (${max})`)
        }
    }
}

// A hidden param never reaches a form, so nobody could give a required one its value.
function assertHiddenParamsFillable(scope: string, params: ParamDef[]): void {
    for (const param of params) {
        if (param.hidden && param.required && param.default === undefined) {
            throw new Error(`${scope}: hidden param "${param.name}" cannot be required without a default`)
        }
    }
}

function assertValidRefresh(scope: string, refresh: WidgetRefresh): void {
    if (refresh.min < 5) {
        throw new Error(`${scope}: refresh.min must be >= 5, got ${refresh.min}`)
    }
    if (refresh.min > refresh.default) {
        throw new Error(`${scope}: refresh.min (${refresh.min}) must be <= refresh.default (${refresh.default})`)
    }
}

function assertValidRateLimit(scope: string, rateLimit: ActionRateLimit): void {
    for (const field of ['max', 'windowSeconds'] as const) {
        const value = rateLimit[field]
        if (!Number.isInteger(value) || value < 1) {
            throw new Error(`${scope}: rateLimit.${field} must be an integer >= 1, got ${value}`)
        }
    }
}

function assertValidService(def: ServiceDef): void {
    if (services.has(def.id)) {
        throw new Error(`Service "${def.id}" is already registered`)
    }

    const widgetIds = new Set<string>()
    for (const widget of def.widgets) {
        const scope = `${def.id}/${widget.id}`

        if (widgetIds.has(widget.id)) {
            throw new Error(`Service "${def.id}": duplicate widget id "${widget.id}"`)
        }
        widgetIds.add(widget.id)

        assertUniqueParams(scope, widget.params)
        assertValidBounds(scope, widget.params)
        assertHiddenParamsFillable(scope, widget.params)
        assertValidRefresh(scope, widget.refresh)
    }

    const actionIds = new Set<string>()
    for (const action of def.actions ?? []) {
        const scope = `${def.id} action "${action.id}"`

        if (actionIds.has(action.id)) {
            throw new Error(`Service "${def.id}": duplicate action id "${action.id}"`)
        }
        actionIds.add(action.id)

        assertUniqueParams(scope, action.params)
        assertValidBounds(scope, action.params)
        if (action.rateLimit) assertValidRateLimit(scope, action.rateLimit)
    }

    if (def.auth.kind === 'apiKey') {
        assertUniqueParams(`${def.id} auth`, def.auth.fields)
        assertValidBounds(`${def.id} auth`, def.auth.fields)
    }

    //only checks that the provider is one we know; whether its env is set is checked at request time,
    //so the API still boots (with the service shown as unavailable) when a provider isn't configured
    if (def.auth.kind === 'oauth2') {
        const { provider, scopes } = def.auth
        if (!isOAuthProviderId(provider)) {
            throw new Error(`Service "${def.id}": unknown OAuth provider "${provider}"`)
        }
        if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === 'string')) {
            throw new Error(`Service "${def.id}": auth.scopes must be an array of strings`)
        }
    }
}

export const registry = {
    register(def: ServiceDef): void {
        assertValidService(def)
        services.set(def.id, def)
    },

    getService(id: string): ServiceDef | undefined {
        return services.get(id)
    },

    getWidget(serviceId: string, widgetId: string): WidgetDef | undefined {
        return services.get(serviceId)?.widgets.find((widget) => widget.id === widgetId)
    },

    getAction(serviceId: string, actionId: string): ActionDef | undefined {
        return services.get(serviceId)?.actions?.find((action) => action.id === actionId)
    },

    listServices(): ServiceDef[] {
        return [...services.values()]
    },
}
// Definitions are plain objects in src/services/definitions/; register.ts's
// registerServices() is the only caller of register() outside tests.

/**
 * Test-only. `bun test` runs every test file in one process, so this module's
 * `services` map is a real singleton shared across files — without this,
 * a service registered in one test file would leak into another's assertions.
 * Not part of the `registry` object on purpose: nothing outside tests should
 * ever call it.
 */
export function __resetRegistryForTests(): void {
    services.clear()
}