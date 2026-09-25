import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { widgetInstances } from '../../db/schema'
import type { WidgetParams } from '../../services/types'

export type WidgetInstance = typeof widgetInstances.$inferSelect

export interface NewWidgetInstance {
    userId: string
    serviceId: string
    widgetId: string
    title: string | null
    params: WidgetParams
    refreshSeconds: number
    x: number
    y: number
    w: number
    h: number
    enabled: boolean
}

export interface WidgetInstancePatch {
    title?: string | null
    params?: WidgetParams
    refreshSeconds?: number
    x?: number
    y?: number
    w?: number
    h?: number
    enabled?: boolean
}

export interface LayoutItem {
    id: string
    x: number
    y: number
    w: number
    h: number
}

export interface DashboardRepo {
    listByUser(userId: string): Promise<WidgetInstance[]>
    findByIdAndUser(id: string, userId: string): Promise<WidgetInstance | undefined>
    insert(input: NewWidgetInstance): Promise<WidgetInstance>
    update(id: string, userId: string, patch: WidgetInstancePatch): Promise<WidgetInstance | undefined>
    delete(id: string, userId: string): Promise<boolean>
    updateLayout(userId: string, items: LayoutItem[]): Promise<boolean>
}

class LayoutTargetMissing extends Error {}

function ownedBy(id: string, userId: string) {
    return and(eq(widgetInstances.id, id), eq(widgetInstances.userId, userId))
}

export const dashboardRepo: DashboardRepo = {
    listByUser(userId) {
        return db
            .select()
            .from(widgetInstances)
            .where(eq(widgetInstances.userId, userId))
            .orderBy(asc(widgetInstances.createdAt))
    },

    async findByIdAndUser(id, userId) {
        const rows = await db
            .select()
            .from(widgetInstances)
            .where(ownedBy(id, userId))
            .limit(1)
        return rows[0]
    },

    async insert(input) {
        const rows = await db.insert(widgetInstances).values(input).returning()
        return rows[0]!
    },

    async update(id, userId, patch) {
        const rows = await db
            .update(widgetInstances)
            .set({ ...patch, updatedAt: new Date() })
            .where(ownedBy(id, userId))
            .returning()
        return rows[0]
    },

    async delete(id, userId) {
        const rows = await db
            .delete(widgetInstances)
            .where(ownedBy(id, userId))
            .returning({ id: widgetInstances.id })
        return rows.length > 0
    },

    async updateLayout(userId, items) {
        try {
            await db.transaction(async (tx) => {
                const now = new Date()

                for (const item of items) {
                    const rows = await tx
                        .update(widgetInstances)
                        .set({ x: item.x, y: item.y, w: item.w, h: item.h, updatedAt: now })
                        .where(ownedBy(item.id, userId))
                        .returning({ id: widgetInstances.id })

                    if (rows.length === 0) throw new LayoutTargetMissing()
                }
            })
            return true
        } catch (error) {
            if (error instanceof LayoutTargetMissing) return false
            throw error
        }
    },
}