import { verticalCompactor } from 'react-grid-layout/core'
import type { LayoutItem } from './types'

export const GRID_COLUMNS = 12
export const MAX_ROWS = 12

type Size = { w: number; h: number }

export function sortByPosition<T extends LayoutItem>(items: T[]): T[] {
    return [...items].sort((a, b) => a.y - b.y || a.x - b.x)
}

function isFree(taken: Set<string>, x: number, y: number, size: Size) {
    if (x + size.w > GRID_COLUMNS) return false
    for (let col = x; col < x + size.w; col++) {
        for (let row = y; row < y + size.h; row++) {
            if (taken.has(`${col},${row}`)) return false
        }
    }
    return true
}

export function pack<T extends LayoutItem>(items: T[]): T[] {
    const taken = new Set<string>()
    let x = 0
    let y = 0
    return items.map((item) => {
        const w = Math.min(item.w, GRID_COLUMNS)
        while (!isFree(taken, x, y, { w, h: item.h })) {
            x += 1
            if (x + w > GRID_COLUMNS) {
                x = 0
                y += 1
            }
        }
        for (let col = x; col < x + w; col++) {
            for (let row = y; row < y + item.h; row++) {
                taken.add(`${col},${row}`)
            }
        }
        return { ...item, x, y, w }
    })
}

// Closes the vertical holes and resolves overlaps downward, with the same
// compactor the grid uses while dragging. A card keeps its column.
export function compact<T extends LayoutItem>(items: T[]): T[] {
    const inside = items.map((item) => {
        const w = Math.min(item.w, GRID_COLUMNS)
        const x = Math.min(Math.max(item.x, 0), GRID_COLUMNS - w)
        return { ...item, x, w }
    })
    const compacted = verticalCompactor.compact(
        inside.map(({ id, x, y, w, h }) => ({ i: id, x, y, w, h })),
        GRID_COLUMNS,
    )
    // The compactor gives back bare layout items, so the new positions are
    // copied onto ours to keep every other field.
    const placed = new Map(compacted.map((item) => [item.i, item]))
    return inside.map((item) => {
        const { x, y } = placed.get(item.id) ?? item
        return { ...item, x, y }
    })
}

export function move<T extends LayoutItem>(
    items: T[],
    id: string,
    direction: 'earlier' | 'later',
): T[] {
    const ordered = sortByPosition(items)
    const from = ordered.findIndex((item) => item.id === id)
    const to = direction === 'earlier' ? from - 1 : from + 1
    if (from === -1 || to < 0 || to >= ordered.length) return items
    const moved = ordered[from]
    ordered[from] = ordered[to]
    ordered[to] = moved
    return pack(ordered)
}

// A new card starts at the bottom left and floats up if there is room above.
export function nextSlot(items: LayoutItem[], size: Size) {
    const bottom = Math.max(0, ...items.map((item) => item.y + item.h))
    const compacted = compact([...items, { id: '', x: 0, y: bottom, ...size }])
    const { x, y } = compacted[compacted.length - 1]
    return { x, y }
}

export function layoutChanges(
    before: LayoutItem[],
    after: LayoutItem[],
): LayoutItem[] {
    const previous = new Map(before.map((item) => [item.id, item]))
    return after
        .filter((item) => {
            const old = previous.get(item.id)
            return (
                !old ||
                old.x !== item.x ||
                old.y !== item.y ||
                old.w !== item.w ||
                old.h !== item.h
            )
        })
        .map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))
}
