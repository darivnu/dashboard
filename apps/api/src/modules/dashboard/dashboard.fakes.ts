import type { ServiceDef, WidgetDef } from '../../services/types'
import type { DashboardRepo, WidgetInstance } from './dashboard.repo'

/**
 * Test-only. In-memory stand-in for the Drizzle repo, with the same ownership
 * and all-or-nothing rules, so services can be tested without Postgres.
 */
export function createFakeRepo(): DashboardRepo & { rows: WidgetInstance[] } {
    const rows: WidgetInstance[] = []

    function owned(id: string, userId: string): WidgetInstance | undefined {
        return rows.find((row) => row.id === id && row.userId === userId)
    }

    return {
        rows,

        async listByUser(userId) {
            return rows.filter((row) => row.userId === userId)
        },

        async findByIdAndUser(id, userId) {
            return owned(id, userId)
        },

        async insert(input) {
            const now = new Date()
            const row: WidgetInstance = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
            rows.push(row)
            return row
        },

        async update(id, userId, patch) {
            const row = owned(id, userId)
            if (!row) return undefined

            for (const [key, value] of Object.entries(patch)) {
                if (value !== undefined) Object.assign(row, { [key]: value })
            }
            row.updatedAt = new Date()
            return row
        },

        async delete(id, userId) {
            const index = rows.findIndex((row) => row.id === id && row.userId === userId)
            if (index === -1) return false

            rows.splice(index, 1)
            return true
        },

        async updateLayout(userId, items) {
            if (!items.every((item) => owned(item.id, userId))) return false

            for (const item of items) {
                Object.assign(owned(item.id, userId)!, { x: item.x, y: item.y, w: item.w, h: item.h })
            }
            return true
        },
    }
}

export function fakeWidget(overrides: Partial<WidgetDef> = {}): WidgetDef {
    return {
        id: 'forecast',
        name: 'Forecast',
        description: 'Shows the forecast',
        params: [
            { name: 'city', type: 'string', label: 'City', required: true },
            { name: 'days', type: 'integer', label: 'Days', default: 5 },
        ],
        refresh: { default: 3600, min: 300 },
        fetch: async () => ({}),
        ...overrides,
    }
}

export function fakeService(overrides: Partial<ServiceDef> = {}): ServiceDef {
    return {
        id: 'weather',
        name: 'Weather',
        auth: { kind: 'none' },
        widgets: [fakeWidget()],
        ...overrides,
    }
}

/** For data-service tests without oauth2 services: asking for a token is a test bug. */
export const noOAuthTokens = {
    getAccessToken: async (): Promise<string> => {
        throw new Error('this test has no oauth2 service')
    },
}
