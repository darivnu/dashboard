import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { apiMock, makeInstance, ok, resetApiMock } from '../test/apiMock'
import { renderWithQuery } from '../test/renderWithQuery'
import WidgetGrid from './WidgetGrid'

vi.mock('../api', async () => (await import('../test/apiMock')).apiModule)

function setup(instances: ReturnType<typeof makeInstance>[]) {
    const handlers = {
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onMove: vi.fn(),
        onSetApiKey: vi.fn(),
    }
    renderWithQuery(<WidgetGrid instances={instances} {...handlers} />)
    return handlers
}

beforeEach(() => {
    resetApiMock()
    apiMock.instanceData.mockResolvedValue(
        ok({
            ok: true,
            data: { message: 'hi' },
            fetchedAt: '2026-10-03T14:32:00.000Z',
        }),
    )
})

test('says so when there are no widgets', () => {
    setup([])
    expect(screen.getByText(/No widgets yet/)).toBeVisible()
})

test('shows one card per widget, ordered by stored position', () => {
    setup([
        makeInstance({ title: 'Third', x: 0, y: 3 }),
        makeInstance({ title: 'Second', x: 4, y: 0 }),
        makeInstance({ title: 'First', x: 0, y: 0 }),
    ])
    expect(
        screen
            .getAllByRole('article')
            .map((card) => card.getAttribute('aria-label')),
    ).toEqual(['First', 'Second', 'Third'])
})

test('a card spans its stored width and height', () => {
    setup([makeInstance({ title: 'Globe', w: 6, h: 5 })])
    const cell = screen.getByRole('article', { name: 'Globe' }).parentElement
    expect(cell?.style.getPropertyValue('--w')).toBe('6')
    expect(cell?.style.getPropertyValue('--h')).toBe('5')
    expect(cell).toHaveClass('md:col-span-(--w)', 'row-span-(--h)')
})

test('a stored width larger than the grid is shown as the full width', () => {
    setup([makeInstance({ title: 'Wide', w: 40 })])
    const cell = screen.getByRole('article', { name: 'Wide' }).parentElement
    expect(cell?.style.getPropertyValue('--w')).toBe('12')
})

test('the controls of a card report that card', async () => {
    const first = makeInstance({ title: 'First', x: 0 })
    const second = makeInstance({ title: 'Second', x: 4 })
    const { onEdit, onDelete, onMove } = setup([first, second])
    const card = within(screen.getByRole('article', { name: 'Second' }))

    await userEvent.click(card.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith(second)

    await userEvent.click(card.getByRole('button', { name: 'Move left' }))
    expect(onMove).toHaveBeenCalledWith(second, 'left')

    await userEvent.click(card.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith(second)
})
