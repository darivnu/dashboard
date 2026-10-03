import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import Field, { describedBy } from './Field'
import Input from './Input'

test('the label names the control inside', () => {
    render(
        <Field label="Title" htmlFor="title">
            <Input id="title" />
        </Field>,
    )
    expect(screen.getByLabelText('Title')).toBe(screen.getByRole('textbox'))
})

test('a required field shows a marker that is not part of the name', () => {
    render(
        <Field label="Message" htmlFor="message" required>
            <Input id="message" />
        </Field>,
    )
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument()
})

test('shows no error or hint unless given one', () => {
    render(
        <Field label="Title" htmlFor="title">
            <Input id="title" />
        </Field>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('shows the error and hint, and the control can point at them', () => {
    const texts = { error: 'Must be at most 500', hint: 'Between 1 and 500' }
    render(
        <Field label="Limit" htmlFor="limit" {...texts}>
            <Input
                id="limit"
                invalid
                aria-describedby={describedBy('limit', texts)}
            />
        </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at most 500')
    expect(
        screen.getByRole('textbox', { name: 'Limit' }),
    ).toHaveAccessibleDescription('Between 1 and 500 Must be at most 500')
})

test('describedBy lists only the ids that exist', () => {
    expect(describedBy('limit', {})).toBeUndefined()
    expect(describedBy('limit', { error: 'bad' })).toBe('limit-error')
    expect(describedBy('limit', { hint: 'tip' })).toBe('limit-hint')
    expect(describedBy('limit', { error: 'bad', hint: 'tip' })).toBe(
        'limit-hint limit-error',
    )
})
