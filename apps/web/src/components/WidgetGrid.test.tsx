import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { apiMock, makeInstance, ok, resetApiMock } from '../test/apiMock'
import { renderWithQuery } from '../test/renderWithQuery'
import WidgetGrid from './WidgetGrid'

vi.mock('../api', async () => (await import('../test/apiMock')).apiModule)

type GridItem = { i: string; x: number; y: number; w: number; h: number }
type GridProps = {
    children: ReactNode
    width: number
    layout: GridItem[]
    gridConfig: unknown
    dragConfig: unknown
    resizeConfig: unknown
    onLayoutChange?: unknown
    onDragStop: (layout: GridItem[]) => void
    onResizeStop: (layout: GridItem[]) => void
}

// jsdom lays nothing out, so a real drag cannot happen here. The library is
// replaced by a stand-in that draws its children and keeps the props it was
// given, so a test can read them and call onDragStop / onResizeStop the way
// the library does when the pointer is released.
const grid = vi.hoisted(() => ({ props: null as GridProps | null }))

vi.mock('react-grid-layout', () => ({
    default: (props: GridProps) => {
        grid.props = props
        return <div data-testid="grid">{props.children}</div>
    },
    useContainerWidth: () => ({
        width: 1200,
        mounted: true,
        containerRef: { current: null },
    }),
}))

function gridProps() {
    if (!grid.props) throw new Error('the grid was not rendered')
    return grid.props
}

function setScreen(wide: boolean) {
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({
            matches: wide,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    )
}

function setup(instances: ReturnType<typeof makeInstance>[]) {
    const handlers = {
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onMove: vi.fn(),
        onLayoutChange: vi.fn(),
        onSetApiKey: vi.fn(),
    }
    renderWithQuery(<WidgetGrid instances={instances} {...handlers} />)
    return handlers
}

function titles() {
    return screen
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-label'))
}

beforeEach(() => {
    resetApiMock()
    grid.props = null
    apiMock.instanceData.mockResolvedValue(
        ok({
            ok: true,
            data: { message: 'hi' },
            fetchedAt: '2026-10-03T14:32:00.000Z',
        }),
    )
})

describe('from 768 px up', () => {
    beforeEach(() => setScreen(true))

    test('asks for the md breakpoint', () => {
        setup([makeInstance()])
        expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 48rem)')
    })

    test('says so when there are no widgets', () => {
        setup([])
        expect(screen.getByText(/No widgets yet/)).toBeVisible()
        expect(screen.queryByTestId('grid')).not.toBeInTheDocument()
    })

    test('shows one card per widget inside the grid', () => {
        setup([
            makeInstance({ title: 'First' }),
            makeInstance({ title: 'Second', x: 4 }),
        ])
        const cards = within(screen.getByTestId('grid'))
        expect(cards.getByRole('article', { name: 'First' })).toBeVisible()
        expect(cards.getByRole('article', { name: 'Second' })).toBeVisible()
    })

    test('gives the grid one layout item per widget, with its limits', () => {
        // mock/echo has a minimum size of 2 x 2
        const echo = makeInstance({ x: 4, y: 3, w: 6, h: 5 })
        setup([echo])
        expect(gridProps().layout).toEqual([
            {
                i: echo.id,
                x: 4,
                y: 3,
                w: 6,
                h: 5,
                minW: 2,
                minH: 2,
                maxW: 12,
                maxH: 12,
            },
        ])
    })

    test('uses the grid geometry of the dashboard and the measured width', () => {
        setup([makeInstance()])
        expect(gridProps().gridConfig).toEqual({
            cols: 12,
            rowHeight: 96,
            margin: [16, 16],
            containerPadding: [0, 0],
        })
        expect(gridProps().width).toBe(1200)
    })

    test('drags by the header only, never from a control', () => {
        setup([makeInstance()])
        expect(gridProps().dragConfig).toEqual({
            handle: '.widget-drag-handle',
            cancel: 'button, a, input, select, textarea',
        })
    })

    test('resizes from the bottom-right corner only', () => {
        setup([makeInstance()])
        expect(gridProps().resizeConfig).toEqual({ handles: ['se'] })
    })

    test('a drop reports only the cards that changed place', () => {
        const a = makeInstance({ x: 0, y: 0 })
        const b = makeInstance({ x: 4, y: 0 })
        const c = makeInstance({ x: 8, y: 0 })
        const { onLayoutChange } = setup([a, b, c])

        act(() =>
            gridProps().onDragStop([
                { i: a.id, x: 4, y: 0, w: 4, h: 3 },
                { i: b.id, x: 0, y: 0, w: 4, h: 3 },
                { i: c.id, x: 8, y: 0, w: 4, h: 3 },
            ]),
        )

        expect(onLayoutChange).toHaveBeenCalledTimes(1)
        expect(onLayoutChange).toHaveBeenCalledWith([
            { id: a.id, x: 4, y: 0, w: 4, h: 3 },
            { id: b.id, x: 0, y: 0, w: 4, h: 3 },
        ])
    })

    test('a resize reports the new size and the cards it pushed', () => {
        const a = makeInstance({ x: 0, y: 0 })
        const under = makeInstance({ x: 0, y: 3 })
        const beside = makeInstance({ x: 4, y: 0 })
        const { onLayoutChange } = setup([a, under, beside])

        act(() =>
            gridProps().onResizeStop([
                { i: a.id, x: 0, y: 0, w: 4, h: 5 },
                { i: under.id, x: 0, y: 5, w: 4, h: 3 },
                { i: beside.id, x: 4, y: 0, w: 4, h: 3 },
            ]),
        )

        expect(onLayoutChange).toHaveBeenCalledTimes(1)
        expect(onLayoutChange).toHaveBeenCalledWith([
            { id: a.id, x: 0, y: 0, w: 4, h: 5 },
            { id: under.id, x: 0, y: 5, w: 4, h: 3 },
        ])
    })

    test('a drop or resize that changes nothing reports nothing', () => {
        const a = makeInstance({ x: 0, y: 0 })
        const { onLayoutChange } = setup([a])
        const same = [{ i: a.id, x: 0, y: 0, w: 4, h: 3 }]

        act(() => gridProps().onDragStop(same))
        act(() => gridProps().onResizeStop(same))

        expect(onLayoutChange).not.toHaveBeenCalled()
    })

    // A dashboard saved before cards could float up can hold a card with a
    // hole above it. The grid shows it floated up without anything being saved.
    test('a drop that leaves such a dashboard as it is shown reports nothing', () => {
        const a = makeInstance({ x: 0, y: 0 })
        const floated = makeInstance({ x: 8, y: 4 })
        const { onLayoutChange } = setup([a, floated])

        act(() =>
            gridProps().onDragStop([
                { i: a.id, x: 0, y: 0, w: 4, h: 3 },
                { i: floated.id, x: 8, y: 0, w: 4, h: 3 },
            ]),
        )

        expect(onLayoutChange).not.toHaveBeenCalled()
    })

    test('a real change also saves the cards the grid had floated up', () => {
        const a = makeInstance({ x: 0, y: 0 })
        const b = makeInstance({ x: 4, y: 0 })
        const floated = makeInstance({ x: 8, y: 4 })
        const { onLayoutChange } = setup([a, b, floated])

        act(() =>
            gridProps().onDragStop([
                { i: a.id, x: 4, y: 0, w: 4, h: 3 },
                { i: b.id, x: 0, y: 0, w: 4, h: 3 },
                { i: floated.id, x: 8, y: 0, w: 4, h: 3 },
            ]),
        )

        expect(onLayoutChange).toHaveBeenCalledWith([
            { id: a.id, x: 4, y: 0, w: 4, h: 3 },
            { id: b.id, x: 0, y: 0, w: 4, h: 3 },
            { id: floated.id, x: 8, y: 0, w: 4, h: 3 },
        ])
    })

    test("does not listen to the library's own layout-change event", () => {
        // That one also fires on mount and when the width changes.
        setup([makeInstance()])
        expect(gridProps().onLayoutChange).toBeUndefined()
    })

    test('the controls of a card report that card', async () => {
        const first = makeInstance({ title: 'First', x: 0 })
        const second = makeInstance({ title: 'Second', x: 4 })
        const { onEdit, onDelete, onMove } = setup([first, second])
        const card = within(screen.getByRole('article', { name: 'Second' }))

        await userEvent.click(card.getByRole('button', { name: 'Edit' }))
        expect(onEdit).toHaveBeenCalledWith(second)

        await userEvent.click(
            card.getByRole('button', { name: 'Move earlier' }),
        )
        expect(onMove).toHaveBeenCalledWith(second, 'earlier')

        await userEvent.click(card.getByRole('button', { name: 'Delete' }))
        expect(onDelete).toHaveBeenCalledWith(second)
    })
})

describe('below 768 px', () => {
    beforeEach(() => setScreen(false))

    test('says so when there are no widgets', () => {
        setup([])
        expect(screen.getByText(/No widgets yet/)).toBeVisible()
    })

    test('does not use the grid library, so nothing drags or resizes', () => {
        setup([makeInstance({ title: 'Only' })])
        expect(screen.getByRole('article', { name: 'Only' })).toBeVisible()
        expect(screen.queryByTestId('grid')).not.toBeInTheDocument()
        expect(grid.props).toBeNull()
    })

    test('shows the cards in one column, by row and then by column', () => {
        setup([
            makeInstance({ title: 'Third', x: 0, y: 3 }),
            makeInstance({ title: 'Second', x: 4, y: 0 }),
            makeInstance({ title: 'First', x: 0, y: 0 }),
        ])
        expect(titles()).toEqual(['First', 'Second', 'Third'])
        const column = screen.getByRole('article', { name: 'First' })
            .parentElement?.parentElement
        expect(column).toHaveClass('grid-cols-1', 'auto-rows-[96px]', 'gap-4')
    })

    test('a card is as tall as its stored height', () => {
        setup([makeInstance({ title: 'Globe', w: 6, h: 5 })])
        const cell = screen.getByRole('article', {
            name: 'Globe',
        }).parentElement
        expect(cell?.style.getPropertyValue('--h')).toBe('5')
        expect(cell).toHaveClass('row-span-(--h)')
    })

    test('the move buttons of a card report that card', async () => {
        const first = makeInstance({ title: 'First', y: 0 })
        const second = makeInstance({ title: 'Second', y: 3 })
        const { onMove } = setup([first, second])
        const card = within(screen.getByRole('article', { name: 'First' }))

        await userEvent.click(card.getByRole('button', { name: 'Move later' }))
        expect(onMove).toHaveBeenCalledWith(first, 'later')
    })
})
