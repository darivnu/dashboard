import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import Button from './Button'

test('renders its label and is a plain button by default', () => {
    render(<Button>Refresh</Button>)
    const button = screen.getByRole('button', { name: 'Refresh' })
    expect(button).toHaveAttribute('type', 'button')
})

test('can be a submit button', () => {
    render(<Button type="submit">Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
        'type',
        'submit',
    )
})

test('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Edit</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onClick).toHaveBeenCalledTimes(1)
})

test('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    render(
        <Button onClick={onClick} disabled>
            Edit
        </Button>,
    )
    const button = screen.getByRole('button', { name: 'Edit' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
})

test('each variant has its own colour', () => {
    render(
        <>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="dangerGhost">Delete</Button>
        </>,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass(
        'text-danger-fg',
    )
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass(
        'bg-primary',
    )
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass(
        'bg-neutral',
    )
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass(
        'bg-danger',
    )
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveClass(
        'text-muted',
    )
})

test('keeps extra classes passed by the caller', () => {
    render(<Button className="w-full">Wide</Button>)
    expect(screen.getByRole('button', { name: 'Wide' })).toHaveClass(
        'w-full',
        'bg-primary',
    )
})
