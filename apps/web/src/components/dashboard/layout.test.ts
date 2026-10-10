import { describe, expect, test } from 'vitest'
import {
    compact,
    GRID_COLUMNS,
    layoutChanges,
    MAX_ROWS,
    move,
    nextSlot,
    pack,
    sortByPosition,
} from './layout'
import type { LayoutItem } from './types'

function item(id: string, w: number, h: number, x = 0, y = 0): LayoutItem {
    return { id, x, y, w, h }
}

function positions(items: LayoutItem[]) {
    return items.map(({ id, x, y }) => `${id}@${x},${y}`)
}

describe('sortByPosition', () => {
    test('orders by row, then by column', () => {
        const sorted = sortByPosition([
            item('c', 4, 3, 0, 3),
            item('b', 4, 3, 4, 0),
            item('a', 4, 3, 0, 0),
        ])
        expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    })

    test('items at the same position keep the order they came in', () => {
        const sorted = sortByPosition([
            item('first', 4, 3),
            item('second', 4, 3),
            item('third', 4, 3),
        ])
        expect(sorted.map((i) => i.id)).toEqual(['first', 'second', 'third'])
    })

    test('does not change the list it was given', () => {
        const input = [item('b', 4, 3, 4, 0), item('a', 4, 3, 0, 0)]
        sortByPosition(input)
        expect(input.map((i) => i.id)).toEqual(['b', 'a'])
    })
})

describe('pack', () => {
    test('the grid has 12 columns', () => {
        expect(GRID_COLUMNS).toBe(12)
    })

    test('fills a row left to right, then starts the next row', () => {
        const packed = pack([
            item('a', 4, 3),
            item('b', 4, 3),
            item('c', 4, 3),
            item('d', 4, 3),
        ])
        expect(positions(packed)).toEqual(['a@0,0', 'b@4,0', 'c@8,0', 'd@0,3'])
    })

    test('a card that does not fit beside a taller one goes under the shorter one', () => {
        const packed = pack([
            item('globe', 6, 5),
            item('a', 4, 3),
            item('b', 4, 3),
        ])
        expect(positions(packed)).toEqual(['globe@0,0', 'a@6,0', 'b@6,3'])
    })

    test('no two cards overlap', () => {
        const packed = pack([
            item('a', 6, 5),
            item('b', 4, 3),
            item('c', 5, 2),
            item('d', 12, 1),
            item('e', 3, 4),
            item('f', 7, 2),
        ])
        const cells = new Set<string>()
        for (const p of packed) {
            for (let x = p.x; x < p.x + p.w; x++) {
                for (let y = p.y; y < p.y + p.h; y++) {
                    expect(cells.has(`${x},${y}`)).toBe(false)
                    cells.add(`${x},${y}`)
                }
            }
            expect(p.x + p.w).toBeLessThanOrEqual(GRID_COLUMNS)
        }
    })

    test('sorting the packed result gives back the same order', () => {
        const order = [
            item('a', 6, 5),
            item('b', 4, 3),
            item('c', 5, 2),
            item('d', 12, 1),
            item('e', 3, 4),
        ]
        const packed = pack(order)
        expect(sortByPosition(packed).map((i) => i.id)).toEqual(
            order.map((i) => i.id),
        )
    })

    test('a card wider than the grid is narrowed to the grid', () => {
        const [wide] = pack([item('wide', 20, 2)])
        expect(wide).toMatchObject({ x: 0, y: 0, w: 12 })
    })

    test('keeps the other fields of each item and leaves the input alone', () => {
        const input = [{ ...item('a', 4, 3, 9, 9), title: 'Echo' }]
        const packed = pack(input)
        expect(packed[0]).toEqual({
            id: 'a',
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            title: 'Echo',
        })
        expect(input[0]).toMatchObject({ x: 9, y: 9 })
    })
})

describe('compact', () => {
    test('a card is at most 12 rows tall', () => {
        expect(MAX_ROWS).toBe(12)
    })

    test('cards float up to close the holes above them', () => {
        const compacted = compact([
            item('a', 4, 3, 0, 2),
            item('b', 4, 3, 4, 9),
        ])
        expect(positions(compacted)).toEqual(['a@0,0', 'b@4,0'])
    })

    test('a card keeps its column', () => {
        const compacted = compact([
            item('a', 4, 3, 0, 0),
            item('b', 4, 3, 8, 5),
        ])
        expect(positions(compacted)).toEqual(['a@0,0', 'b@8,0'])
    })

    test('a card that grew pushes the cards under it down, and no other', () => {
        const compacted = compact([
            item('grown', 4, 5, 0, 0),
            item('under', 4, 3, 0, 3),
            item('beside', 4, 3, 4, 0),
        ])
        expect(positions(compacted)).toEqual([
            'grown@0,0',
            'under@0,5',
            'beside@4,0',
        ])
    })

    test('cards stored at the same place are stacked', () => {
        const compacted = compact([
            item('a', 4, 3),
            item('b', 4, 3),
            item('c', 4, 3),
        ])
        expect(positions(compacted)).toEqual(['a@0,0', 'b@0,3', 'c@0,6'])
    })

    test('no two cards overlap', () => {
        const compacted = compact([
            item('a', 6, 5, 0, 0),
            item('b', 4, 3, 3, 1),
            item('c', 5, 2, 7, 0),
            item('d', 12, 1, 0, 2),
            item('e', 3, 4, 9, 9),
            item('f', 7, 2, 2, 4),
        ])
        const cells = new Set<string>()
        for (const p of compacted) {
            for (let x = p.x; x < p.x + p.w; x++) {
                for (let y = p.y; y < p.y + p.h; y++) {
                    expect(cells.has(`${x},${y}`)).toBe(false)
                    cells.add(`${x},${y}`)
                }
            }
            expect(p.x + p.w).toBeLessThanOrEqual(GRID_COLUMNS)
        }
    })

    test('no card has only empty cells right above it', () => {
        const compacted = compact([
            item('a', 6, 5, 0, 4),
            item('b', 4, 3, 3, 12),
            item('c', 5, 2, 7, 1),
            item('d', 12, 1, 0, 30),
        ])
        const cells = new Set<string>()
        for (const p of compacted) {
            for (let x = p.x; x < p.x + p.w; x++) {
                for (let y = p.y; y < p.y + p.h; y++) cells.add(`${x},${y}`)
            }
        }
        for (const p of compacted) {
            if (p.y === 0) continue
            const above = Array.from({ length: p.w }, (_, i) =>
                cells.has(`${p.x + i},${p.y - 1}`),
            )
            expect(above).toContain(true)
        }
    })

    test('a card wider than the grid is narrowed to the grid', () => {
        const [wide] = compact([item('wide', 20, 2)])
        expect(wide).toMatchObject({ x: 0, y: 0, w: 12 })
    })

    test('a card that sticks out on the right is pulled back inside', () => {
        const [card] = compact([item('a', 4, 3, 10, 0)])
        expect(card).toMatchObject({ x: 8, y: 0, w: 4 })
    })

    test('keeps the order and the other fields, and leaves the input alone', () => {
        const input = [
            { ...item('b', 4, 3, 4, 2), title: 'Second' },
            { ...item('a', 4, 3, 0, 2), title: 'First' },
        ]
        const compacted = compact(input)
        expect(compacted).toEqual([
            { id: 'b', x: 4, y: 0, w: 4, h: 3, title: 'Second' },
            { id: 'a', x: 0, y: 0, w: 4, h: 3, title: 'First' },
        ])
        expect(input[0]).toMatchObject({ x: 4, y: 2 })
    })

    test('an empty dashboard stays empty', () => {
        expect(compact([])).toEqual([])
    })
})

describe('move', () => {
    const three = pack([item('a', 4, 3), item('b', 4, 3), item('c', 4, 3)])

    test('later swaps a card with the next one', () => {
        expect(positions(move(three, 'a', 'later'))).toEqual([
            'b@0,0',
            'a@4,0',
            'c@8,0',
        ])
    })

    test('earlier swaps a card with the previous one', () => {
        expect(positions(move(three, 'c', 'earlier'))).toEqual([
            'a@0,0',
            'c@4,0',
            'b@8,0',
        ])
    })

    test('the first card cannot go earlier, nor the last later', () => {
        expect(move(three, 'a', 'earlier')).toBe(three)
        expect(move(three, 'c', 'later')).toBe(three)
    })

    test('an unknown id changes nothing', () => {
        expect(move(three, 'nope', 'earlier')).toBe(three)
    })

    test('a card that cannot move leaves a hand-arranged layout as it is', () => {
        const arranged = [item('a', 4, 3, 8, 0), item('b', 4, 3, 0, 3)]
        expect(move(arranged, 'a', 'earlier')).toBe(arranged)
    })

    test('works from stored positions, whatever order the list is in', () => {
        const shuffled = [three[2], three[0], three[1]]
        expect(positions(move(shuffled, 'a', 'later'))).toEqual([
            'b@0,0',
            'a@4,0',
            'c@8,0',
        ])
    })

    test('a move re-flows every card in reading order', () => {
        const arranged = [
            item('a', 4, 3, 0, 0),
            item('b', 4, 3, 8, 0),
            item('c', 4, 3, 0, 3),
        ]
        expect(positions(move(arranged, 'c', 'earlier'))).toEqual([
            'a@0,0',
            'c@4,0',
            'b@8,0',
        ])
    })
})

describe('nextSlot', () => {
    test('an empty dashboard starts at the top left', () => {
        expect(nextSlot([], { w: 6, h: 5 })).toEqual({ x: 0, y: 0 })
    })

    test('a new card goes to the left, under the last row', () => {
        const three = pack([item('a', 4, 3), item('b', 4, 3), item('c', 4, 3)])
        expect(nextSlot(three, { w: 6, h: 5 })).toEqual({ x: 0, y: 3 })
    })

    test('it is not placed beside the last card, even when there is room', () => {
        const two = pack([item('a', 4, 3), item('b', 4, 3)])
        expect(nextSlot(two, { w: 4, h: 3 })).toEqual({ x: 0, y: 3 })
    })

    test('it floats up when the left columns are free above', () => {
        const right = [item('a', 4, 6, 8, 0)]
        expect(nextSlot(right, { w: 4, h: 3 })).toEqual({ x: 0, y: 0 })
    })

    test('it stops under the lowest card in its own columns', () => {
        const stairs = [item('a', 2, 2, 0, 0), item('b', 4, 6, 6, 0)]
        expect(nextSlot(stairs, { w: 4, h: 3 })).toEqual({ x: 0, y: 2 })
    })
})

describe('layoutChanges', () => {
    test('lists only the cards whose position or size changed', () => {
        const before = [item('a', 4, 3, 0, 0), item('b', 4, 3, 4, 0)]
        const after = [item('a', 4, 3, 0, 0), item('b', 6, 3, 0, 3)]
        expect(layoutChanges(before, after)).toEqual([
            { id: 'b', x: 0, y: 3, w: 6, h: 3 },
        ])
    })

    test('sends only the layout fields, not the whole item', () => {
        const before = [{ ...item('a', 4, 3, 0, 0), title: 'Echo' }]
        const after = [{ ...item('a', 4, 3, 4, 0), title: 'Echo' }]
        expect(layoutChanges(before, after)).toEqual([
            { id: 'a', x: 4, y: 0, w: 4, h: 3 },
        ])
    })

    test('a card that did not exist before counts as changed', () => {
        expect(layoutChanges([], [item('a', 4, 3, 0, 0)])).toEqual([
            { id: 'a', x: 0, y: 0, w: 4, h: 3 },
        ])
    })

    test('nothing changed gives an empty list', () => {
        const same = [item('a', 4, 3, 0, 0)]
        expect(layoutChanges(same, same)).toEqual([])
    })
})
