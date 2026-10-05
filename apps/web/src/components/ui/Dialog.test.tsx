import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import Dialog from './Dialog'

test('shows nothing while closed', () => {
    render(
        <Dialog open={false} onClose={() => {}} title="Add widget">
            <p>Body</p>
        </Dialog>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
})

test('when open, is a dialog named by its title and shows its content', () => {
    render(
        <Dialog open onClose={() => {}} title="Add widget">
            <p>Body</p>
        </Dialog>,
    )
    expect(
        screen.getByRole('dialog', { name: 'Add widget' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
})

test('the Close button asks the parent to close', async () => {
    const onClose = vi.fn()
    render(
        <Dialog open onClose={onClose} title="Add widget">
            <p>Body</p>
        </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
})

test('closing natively (Escape) asks the parent to close', () => {
    const onClose = vi.fn()
    render(
        <Dialog open onClose={onClose} title="Add widget">
            <p>Body</p>
        </Dialog>,
    )
    fireEvent(screen.getByRole('dialog'), new Event('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
})

test('closes when the parent sets open to false, and drops its content', () => {
    const { rerender } = render(
        <Dialog open onClose={() => {}} title="Add widget">
            <p>Body</p>
        </Dialog>,
    )
    rerender(
        <Dialog open={false} onClose={() => {}} title="Add widget">
            <p>Body</p>
        </Dialog>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
})
