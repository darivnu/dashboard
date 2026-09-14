import { beforeEach, describe, expect, test } from 'bun:test'
import { __resetRegistryForTests, registry } from './registry'
import type { ServiceDef, WidgetDef } from './types'

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
