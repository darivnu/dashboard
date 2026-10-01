/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** fake subscriptions repo for the tests
*/

import type { ServiceSubscriptionInstance, ServiceSubscriptionRepo } from './subscriptions.repo'

/**
 * Test-only. In-memory stand-in for the Drizzle repo, with the same ownership
 * and upsert rules, so services and routes can be tested without Postgres.
 *
 * Why? Tests should be fast and not need a real database running. So instead
 * of a table, this fake keeps the rows in a plain array. Because it has the
 * exact same functions as the real repo (it "implements" the
 * ServiceSubscriptionRepo interface), the service can't tell the difference.
 *
 * The return type `ServiceSubscriptionRepo & { rows: ... }` means "everything a
 * repo has, AND a `rows` array" so tests can look inside and check what got saved.
 */
export function createFakeSubscriptionsRepo(): ServiceSubscriptionRepo & { rows: ServiceSubscriptionInstance[] } {
    const rows: ServiceSubscriptionInstance[] = [] //our pretend database table

    //same as ownedBy() in the real repo: find the row of this user for this service
    function owned(userId: string, serviceId: string): ServiceSubscriptionInstance | undefined {
        return rows.find((row) => row.userId === userId && row.serviceId === serviceId)
    }

    return {
        rows,

        async find(userId, serviceId) {
            return owned(userId, serviceId)
        },

        async listByUser(userId) {
            return rows.filter((row) => row.userId === userId) //only this user's rows
        },

        async upsert(userId, serviceId, credentials) {
            //already subscribed → update the row, like onConflictDoUpdate in the real repo
            const existing = owned(userId, serviceId)
            if (existing) {
                Object.assign(existing, { credentials, status: 'active', updatedAt: new Date() }) //copy these fields onto the row
                return existing
            }

            //not subscribed yet → make a new row, filling what the database would fill by itself (id, dates, status)
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
            if (index === -1) return false //-1 = not found (not mine, or doesn't exist)

            rows.splice(index, 1) //remove 1 element at position `index`
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
