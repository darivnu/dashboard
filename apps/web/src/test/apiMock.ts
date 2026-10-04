import { vi } from 'vitest'

// A stand-in for the Eden client in src/api.ts. A test file swaps it in with:
//
//     vi.mock('../../api', async () => (await import('../../test/apiMock')).apiModule)
//
// and then scripts each call, e.g. `apiMock.listInstances.mockResolvedValue(ok({ instances: [] }))`.
export const apiMock = {
    catalog: vi.fn(),
    listInstances: vi.fn(),
    createInstance: vi.fn(),
    /** receives the `{ id }` given to `api.dashboard.instances({ id })` */
    instanceById: vi.fn(),
    updateInstance: vi.fn(),
    deleteInstance: vi.fn(),
    instanceData: vi.fn(),
    saveLayout: vi.fn(),
    /** receives the `{ service }` given to `api.subscriptions({ service })` */
    subscriptionByService: vi.fn(),
    subscribe: vi.fn(),
}

export const apiModule = {
    api: {
        catalog: { get: apiMock.catalog },
        dashboard: {
            instances: Object.assign(
                (params: { id: string }) => {
                    apiMock.instanceById(params)
                    return {
                        patch: apiMock.updateInstance,
                        delete: apiMock.deleteInstance,
                        data: { get: apiMock.instanceData },
                    }
                },
                { get: apiMock.listInstances, post: apiMock.createInstance },
            ),
            layout: { patch: apiMock.saveLayout },
        },
        subscriptions: (params: { service: string }) => {
            apiMock.subscriptionByService(params)
            return { post: apiMock.subscribe }
        },
    },
}

export function resetApiMock() {
    for (const fn of Object.values(apiMock)) fn.mockReset()
}

/** What Eden resolves with when the API answers 2xx. */
export function ok<T>(data: T) {
    return { data, error: null, status: 200 }
}

/** What Eden resolves with when the API answers with its `{ error, message }` envelope. */
export function fail(status: number, error: string, message: string) {
    return { data: null, error: { status, value: { error, message } }, status }
}

let nextId = 1

/** A widget instance as the API returns it; pass only the fields a test cares about. */
export function makeInstance(overrides: Record<string, unknown> = {}) {
    const id = `instance-${nextId++}`
    return {
        id,
        serviceId: 'mock',
        widgetId: 'echo',
        title: null,
        params: { message: 'hi' },
        refreshSeconds: 60,
        x: 0,
        y: 0,
        w: 4,
        h: 3,
        enabled: true,
        createdAt: new Date('2026-10-01T10:00:00Z'),
        updatedAt: new Date('2026-10-01T10:00:00Z'),
        ...overrides,
    }
}
