import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog'

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
        <ConfirmDialog
            open
            title="Delete widget"
            message='Delete "Europe"? This cannot be undone.'
            confirmLabel="Delete"
            onConfirm={onConfirm}
            onCancel={onCancel}
            {...overrides}
        />,
    )
    return { onConfirm, onCancel }
}

test('shows nothing while closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('asks the question in a dialog', () => {
    setup()
    expect(
        screen.getByRole('dialog', { name: 'Delete widget' }),
    ).toBeInTheDocument()
    expect(
        screen.getByText('Delete "Europe"? This cannot be undone.'),
    ).toBeInTheDocument()
})

test('the confirm button confirms', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
})

test('Cancel cancels without confirming', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
})

test('closing the dialog counts as cancelling', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
})

test('the confirm button is disabled while busy', () => {
    setup({ busy: true })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
})

test('shows an error when the action failed', () => {
    setup({ error: "Couldn't reach the dashboard server." })
    expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't reach the dashboard server.",
    )
})
