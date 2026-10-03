import type { ParamDef, ServiceDef, WidgetDef, WidgetRefresh } from './types'

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

function assertValidRefresh(scope: string, refresh: WidgetRefresh): void {
    if (refresh.min < 5) {
        throw new Error(`${scope}: refresh.min must be >= 5, got ${refresh.min}`)
    }
    if (refresh.min > refresh.default) {
        throw new Error(`${scope}: refresh.min (${refresh.min}) must be <= refresh.default (${refresh.default})`)
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
        assertValidRefresh(scope, widget.refresh)
    }

    if (def.auth.kind === 'apiKey') {
        assertUniqueParams(`${def.id} auth`, def.auth.fields)
        assertValidBounds(`${def.id} auth`, def.auth.fields)
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