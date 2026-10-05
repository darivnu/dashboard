import { describe, expect, test } from 'vitest'
import {
    GRID_COLUMNS,
    layoutChanges,
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

describe('move', () => {
    const three = pack([item('a', 4, 3), item('b', 4, 3), item('c', 4, 3)])

    test('right swaps a card with the next one', () => {
        expect(positions(move(three, 'a', 'right'))).toEqual([
            'b@0,0',
            'a@4,0',
            'c@8,0',
        ])
    })

    test('left swaps a card with the previous one', () => {
        expect(positions(move(three, 'c', 'left'))).toEqual([
            'a@0,0',
            'c@4,0',
            'b@8,0',
        ])
    })

    test('the first card cannot go further left, nor the last further right', () => {
        expect(positions(move(three, 'a', 'left'))).toEqual(positions(three))
        expect(positions(move(three, 'c', 'right'))).toEqual(positions(three))
    })

    test('an unknown id changes nothing', () => {
        expect(positions(move(three, 'nope', 'left'))).toEqual(positions(three))
    })

    test('works from stored positions, whatever order the list is in', () => {
        const shuffled = [three[2], three[0], three[1]]
        expect(positions(move(shuffled, 'a', 'right'))).toEqual([
            'b@0,0',
            'a@4,0',
            'c@8,0',
        ])
    })
})

describe('nextSlot', () => {
    test('an empty dashboard starts at the top left', () => {
        expect(nextSlot([], { w: 6, h: 5 })).toEqual({ x: 0, y: 0 })
    })

    test('a new card goes after the last one', () => {
        const two = pack([item('a', 4, 3), item('b', 4, 3)])
        expect(nextSlot(two, { w: 4, h: 3 })).toEqual({ x: 8, y: 0 })
    })

    test('a new card that does not fit in the row goes to the next free place', () => {
        const three = pack([item('a', 4, 3), item('b', 4, 3), item('c', 4, 3)])
        expect(nextSlot(three, { w: 6, h: 5 })).toEqual({ x: 0, y: 3 })
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
