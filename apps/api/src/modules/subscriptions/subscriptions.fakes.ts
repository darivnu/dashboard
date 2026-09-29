import type { ServiceSubscriptionInstance, ServiceSubscriptionRepo } from './subscriptions.repo'

/**
 * Test-only. In-memory stand-in for the Drizzle repo, with the same ownership
 * and upsert rules, so services and routes can be tested without Postgres.
 */
export function createFakeSubscriptionsRepo(): ServiceSubscriptionRepo & { rows: ServiceSubscriptionInstance[] } {
    const rows: ServiceSubscriptionInstance[] = []

    function owned(userId: string, serviceId: string): ServiceSubscriptionInstance | undefined {
        return rows.find((row) => row.userId === userId && row.serviceId === serviceId)
    }

    return {
        rows,

        async find(userId, serviceId) {
            return owned(userId, serviceId)
        },

        async listByUser(userId) {
            return rows.filter((row) => row.userId === userId)
        },

        async upsert(userId, serviceId, credentials) {
            const existing = owned(userId, serviceId)
            if (existing) {
                Object.assign(existing, { credentials, status: 'active', updatedAt: new Date() })
                return existing
            }

            const now = new Date()
            const row: ServiceSubscriptionInstance = {
                id: crypto.randomUUID(),
                userId,
                serviceId,
                status: 'active',
                credentials,
                createdAt: now,
                updatedAt: now,
            }
            rows.push(row)
            return row
        },

        async delete(userId, serviceId) {
            const index = rows.findIndex((row) => row.userId === userId && row.serviceId === serviceId)
            if (index === -1) return false

            rows.splice(index, 1)
            return true
        },

        async setStatus(userId, serviceId, status) {
            const row = owned(userId, serviceId)
            if (!row) return undefined

            Object.assign(row, { status, updatedAt: new Date() })
            return row
        },
    }
}
