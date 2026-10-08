import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import Input from './Input'

test('renders a text box the user can type into', async () => {
    const onChange = vi.fn()
    render(<Input aria-label="Title" onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'ab')
    expect(onChange).toHaveBeenCalledTimes(2)
})

test('passes native attributes through', () => {
    render(<Input aria-label="Limit" type="number" min={1} max={500} />)
    const input = screen.getByRole('spinbutton', { name: 'Limit' })
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '500')
})

test('is not marked invalid by default', () => {
    render(<Input aria-label="Title" />)
    const input = screen.getByRole('textbox', { name: 'Title' })
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveClass('focus:ring-focus')
})

test('is marked invalid for assistive technology and in red', () => {
    render(<Input aria-label="Title" invalid />)
    const input = screen.getByRole('textbox', { name: 'Title' })
    expect(input).toBeInvalid()
    expect(input).toHaveClass('ring-danger')
})

test('keeps extra classes passed by the caller', () => {
    render(<Input aria-label="Title" className="max-w-xs" />)
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveClass(
        'max-w-xs',
        'bg-surface-raised',
    )
})
