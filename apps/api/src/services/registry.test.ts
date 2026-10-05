import { beforeEach, describe, expect, test } from 'bun:test'
import { __resetRegistryForTests, registry } from './registry'
import type { ParamDef, ServiceDef, WidgetDef } from './types'

beforeEach(() => {
    __resetRegistryForTests()
})

function widget(overrides: Partial<WidgetDef> = {}): WidgetDef {
    return {
        id: 'widget',
        name: 'Widget',
        description: 'A widget',
        params: [],
        refresh: { default: 60, min: 5 },
        fetch: async () => ({}),
        ...overrides,
    }
}

function service(overrides: Partial<ServiceDef> = {}): ServiceDef {
    return {
        id: 'service',
        name: 'Test Service',
        auth: { kind: 'none' },
        widgets: [widget()],
        ...overrides,
    }
}

describe('registry', () => {
    test('registers a service and makes it retrievable', () => {
        const def = service()
        registry.register(def)

        expect(registry.getService('service')).toBe(def)
        expect(registry.getWidget('service', 'widget')).toBe(def.widgets[0])
        expect(registry.listServices()).toEqual([def])
    })

    test('rejects a duplicate service id', () => {
        registry.register(service())

        expect(() => registry.register(service())).toThrow(
            'Service "service" is already registered',
        )
    })

    test('rejects duplicate widget ids within a service', () => {
        const dup = widget()

        expect(() => registry.register(service({ widgets: [dup, dup] }))).toThrow(
            /duplicate widget id/,
        )
    })

    test('rejects duplicate param names within a widget', () => {
        const def = service({
            widgets: [
                widget({
                    params: [
                        { name: 'city', type: 'string', label: 'City' },
                        { name: 'city', type: 'integer', label: 'City again' },
                    ],
                }),
            ],
        })

        expect(() => registry.register(def)).toThrow(/duplicate param "city"/)
    })

    test('rejects refresh.min below the 5 second floor', () => {
        const def = service({ widgets: [widget({ refresh: { default: 60, min: 1 } })] })

        expect(() => registry.register(def)).toThrow(/refresh\.min must be >= 5/)
    })

    test('rejects refresh.min greater than refresh.default', () => {
        const def = service({ widgets: [widget({ refresh: { default: 10, min: 20 } })] })

        expect(() => registry.register(def)).toThrow(
            /refresh\.min \(20\) must be <= refresh\.default \(10\)/,
        )
    })

    test('rejects duplicate param names in apiKey auth fields', () => {
        const def = service({
            auth: {
                kind: 'apiKey',
                fields: [
                    { name: 'token', type: 'string', label: 'Token' },
                    { name: 'token', type: 'string', label: 'Token again' },
                ],
            },
        })

        expect(() => registry.register(def)).toThrow(/duplicate param "token"/)
    })
})

describe('registry integer param bounds', () => {
    function withParam(param: ParamDef): ServiceDef {
        return service({ widgets: [widget({ params: [param] })] })
    }

    test('accepts a valid range with a default inside it', () => {
        const def = withParam({
            name: 'limit', type: 'integer', label: 'Limit', default: 200, min: 1, max: 500,
        })

        expect(() => registry.register(def)).not.toThrow()
    })

    test('accepts a default sitting exactly on a bound', () => {
        const def = withParam({
            name: 'limit', type: 'integer', label: 'Limit', default: 1, min: 1, max: 1,
        })

        expect(() => registry.register(def)).not.toThrow()
    })

    test('accepts a param declaring only one bound', () => {
        const def = service({
            widgets: [
                widget({
                    params: [
                        { name: 'low', type: 'integer', label: 'Low', default: 3, min: 1 },
                        { name: 'high', type: 'integer', label: 'High', default: 3, max: 10 },
                    ],
                }),
            ],
        })

        expect(() => registry.register(def)).not.toThrow()
    })

    test('rejects min greater than max', () => {
        const def = withParam({ name: 'limit', type: 'integer', label: 'Limit', min: 5, max: 1 })

        expect(() => registry.register(def)).toThrow(
            'service/widget: param "limit" min (5) must be <= max (1)',
        )
    })

    test('rejects a default below min', () => {
        const def = withParam({
            name: 'limit', type: 'integer', label: 'Limit', default: 0, min: 1, max: 500,
        })

        expect(() => registry.register(def)).toThrow(
            'service/widget: param "limit" default (0) must be >= min (1)',
        )
    })

    test('rejects a default above max', () => {
        const def = withParam({
            name: 'limit', type: 'integer', label: 'Limit', default: 501, min: 1, max: 500,
        })

        expect(() => registry.register(def)).toThrow(
            'service/widget: param "limit" default (501) must be <= max (500)',
        )
    })

    test('rejects a default outside a range that declares only one bound', () => {
        const below = withParam({ name: 'limit', type: 'integer', label: 'Limit', default: 0, min: 1 })
        const above = withParam({ name: 'limit', type: 'integer', label: 'Limit', default: 11, max: 10 })

        expect(() => registry.register(below)).toThrow(/default \(0\) must be >= min \(1\)/)
        expect(() => registry.register(above)).toThrow(/default \(11\) must be <= max \(10\)/)
    })

    test.each([
        ['min', { min: 1.5 }, /min must be an integer, got 1\.5/],
        ['max', { max: 9.5 }, /max must be an integer, got 9\.5/],
        ['min', { min: Number.NaN }, /min must be an integer, got NaN/],
    ] as const)('rejects a non-integer %s', (_side, bounds, message) => {
        const def = withParam({ name: 'limit', type: 'integer', label: 'Limit', ...bounds })

        expect(() => registry.register(def)).toThrow(message)
    })

    test('does not register a service whose bounds are invalid', () => {
        const def = withParam({ name: 'limit', type: 'integer', label: 'Limit', min: 5, max: 1 })

        expect(() => registry.register(def)).toThrow()
        expect(registry.getService('service')).toBeUndefined()
    })

    test('applies the same check to apiKey auth fields', () => {
        const def = service({
            auth: {
                kind: 'apiKey',
                fields: [{ name: 'port', type: 'integer', label: 'Port', min: 10, max: 1 }],
            },
        })

        expect(() => registry.register(def)).toThrow(
            'service auth: param "port" min (10) must be <= max (1)',
        )
    })

    test('accepts an oauth2 service with a known provider', () => {
        const def = service({ auth: { kind: 'oauth2', provider: 'github', scopes: ['notifications'] } })

        registry.register(def)

        expect(registry.getService('service')).toBe(def)
    })

    test('rejects an oauth2 service with an unknown provider', () => {
        const def = service({
            auth: { kind: 'oauth2', provider: 'myspace' as never, scopes: [] },
        })

        expect(() => registry.register(def)).toThrow('Service "service": unknown OAuth provider "myspace"')
    })

    test('rejects oauth2 scopes that are not strings', () => {
        const def = service({
            auth: { kind: 'oauth2', provider: 'github', scopes: [42] as never },
        })

        expect(() => registry.register(def)).toThrow(/auth\.scopes must be an array of strings/)
    })
})
