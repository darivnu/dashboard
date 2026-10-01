import { AppError } from '../../lib/errors'
import { validateParams } from '../../services/params'
import { registry } from '../../services/registry'
import { WidgetFetchError } from '../../services/types'
import type { WidgetDef, WidgetParams } from '../../services/types'
import type { DashboardRepo, LayoutItem, WidgetInstance, WidgetInstancePatch } from './dashboard.repo'

const DEFAULT_LAYOUT = { x: 0, y: 0, w: 4, h: 3 }

export interface CreateInstanceInput {
    serviceId: string
    widgetId: string
    title?: string | null
    params?: unknown
    refreshSeconds?: number
    x?: number
    y?: number
    w?: number
    h?: number
    enabled?: boolean
}

export interface UpdateInstanceInput {
    title?: string | null
    params?: unknown
    refreshSeconds?: number
    x?: number
    y?: number
    w?: number
    h?: number
    enabled?: boolean
}

function notFound(): AppError {
    return new AppError(404, 'NOT_FOUND', 'Widget instance not found')
}

function unknownWidget(): AppError {
    return new AppError(400, 'UNKNOWN_WIDGET', 'Unknown service or widget')
}

/** validateParams() reports bad input as a widget error; for this API it is a 400. */
function resolveParams(widget: WidgetDef, input: unknown): WidgetParams {
    try {
        return validateParams(widget.params, input)
    } catch (error) {
        if (error instanceof WidgetFetchError) {
            throw new AppError(400, 'INVALID_PARAMS', error.message)
        }
        throw error
    }
}

function resolveRefreshSeconds(widget: WidgetDef, requested: number | undefined): number {
    if (requested === undefined) return widget.refresh.default

    if (requested < widget.refresh.min) {
        throw new AppError(
            400,
            'REFRESH_TOO_LOW',
            `refreshSeconds must be at least ${widget.refresh.min} for this widget`,
        )
    }
    return requested
}

export function createDashboardService(repo: DashboardRepo) {
    return {
        list(userId: string): Promise<WidgetInstance[]> {
            return repo.listByUser(userId)
        },

        async create(userId: string, input: CreateInstanceInput): Promise<WidgetInstance> {
            const widget = registry.getWidget(input.serviceId, input.widgetId)
            if (!widget) throw unknownWidget()

            return repo.insert({
                userId,
                serviceId: input.serviceId,
                widgetId: input.widgetId,
                title: input.title ?? null,
                params: resolveParams(widget, input.params ?? {}),
                refreshSeconds: resolveRefreshSeconds(widget, input.refreshSeconds),
                x: input.x ?? DEFAULT_LAYOUT.x,
                y: input.y ?? DEFAULT_LAYOUT.y,
                w: input.w ?? DEFAULT_LAYOUT.w,
                h: input.h ?? DEFAULT_LAYOUT.h,
                enabled: input.enabled ?? true,
            })
        },

        async update(userId: string, id: string, input: UpdateInstanceInput): Promise<WidgetInstance> {
            const existing = await repo.findByIdAndUser(id, userId)
            if (!existing) throw notFound()

            const patch: WidgetInstancePatch = {
                title: input.title,
                x: input.x,
                y: input.y,
                w: input.w,
                h: input.h,
                enabled: input.enabled,
            }

            if (input.params !== undefined || input.refreshSeconds !== undefined) {
                const widget = registry.getWidget(existing.serviceId, existing.widgetId)
                if (!widget) throw unknownWidget()

                if (input.params !== undefined) {
                    patch.params = resolveParams(widget, input.params)
                }
                if (input.refreshSeconds !== undefined) {
                    patch.refreshSeconds = resolveRefreshSeconds(widget, input.refreshSeconds)
                }
            }

            const updated = await repo.update(id, userId, patch)
            if (!updated) throw notFound()
            return updated
        },

        async remove(userId: string, id: string): Promise<void> {
            const deleted = await repo.delete(id, userId)
            if (!deleted) throw notFound()
        },

        async updateLayout(userId: string, items: LayoutItem[]): Promise<WidgetInstance[]> {
            const ids = new Set(items.map((item) => item.id))
            if (ids.size !== items.length) {
                throw new AppError(400, 'DUPLICATE_ID', 'Each instance may appear only once in a layout update')
            }

            const applied = await repo.updateLayout(userId, items)
            if (!applied) throw notFound()

            return repo.listByUser(userId)
        },
    }
}

export type DashboardService = ReturnType<typeof createDashboardService>