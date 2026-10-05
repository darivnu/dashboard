import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import ParamForm from './ParamForm'
import type { CatalogParam } from './types'
import type { ParamErrors, ParamValues } from './validateParams'

const message: CatalogParam = {
    name: 'message',
    label: 'Message',
    type: 'string',
    required: true,
}
const limit: CatalogParam = {
    name: 'limit',
    label: 'How many stations',
    type: 'integer',
    required: false,
    default: 200,
    min: 1,
    max: 500,
}

// The form holds no state itself; this parent does, as the real one will.
function Harness({
    params,
    initial = {},
    errors = {},
    onChange = () => {},
}: {
    params: CatalogParam[]
    initial?: ParamValues
    errors?: ParamErrors
    onChange?: (name: string, value: string) => void
}) {
    const [values, setValues] = useState(initial)
    return (
        <ParamForm
            idPrefix="test"
            params={params}
            values={values}
            errors={errors}
            onChange={(name, value) => {
                onChange(name, value)
                setValues((old) => ({ ...old, [name]: value }))
            }}
        />
    )
}

test('renders one labelled field per catalog param, with its value', () => {
    render(
        <Harness
            params={[message, limit]}
            initial={{ message: 'hi', limit: '200' }}
        />,
    )
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('hi')
    expect(
        screen.getByRole('spinbutton', { name: 'How many stations' }),
    ).toHaveValue(200)
})

test('an integer param is a number field carrying the catalog bounds', () => {
    render(<Harness params={[limit]} />)
    const input = screen.getByRole('spinbutton', { name: 'How many stations' })
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '500')
    expect(input).toHaveAccessibleDescription('Between 1 and 500.')
})

test.each([
    [{ min: 1 }, 'At least 1.'],
    [{ max: 10 }, 'At most 10.'],
    [{}, ''],
])('the hint follows the bounds the catalog sends (%j)', (bounds, hint) => {
    const count: CatalogParam = {
        name: 'count',
        label: 'Count',
        type: 'integer',
        required: false,
        ...bounds,
    }
    render(<Harness params={[count]} />)
    expect(
        screen.getByRole('spinbutton', { name: 'Count' }),
    ).toHaveAccessibleDescription(hint)
})

test('reports each change with the param name and the typed text', async () => {
    const onChange = vi.fn()
    render(<Harness params={[message, limit]} onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'yo')
    expect(onChange).toHaveBeenLastCalledWith('message', 'yo')

    await userEvent.type(
        screen.getByRole('spinbutton', { name: 'How many stations' }),
        '50',
    )
    expect(onChange).toHaveBeenLastCalledWith('limit', '50')
})

test('shows the error of a field and marks that field invalid', () => {
    render(
        <Harness
            params={[message, limit]}
            initial={{ message: 'hi', limit: '900' }}
            errors={{ limit: 'Must be at most 500.' }}
        />,
    )
    const input = screen.getByRole('spinbutton', { name: 'How many stations' })
    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription(
        'Between 1 and 500. Must be at most 500.',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at most 500.')
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeValid()
})

test('marks required fields', () => {
    render(<Harness params={[message, limit]} />)
    expect(screen.getAllByText('*')).toHaveLength(1)
})

test('says so when the widget has no settings', () => {
    render(<Harness params={[]} />)
    expect(screen.getByText('This widget has no settings.')).toBeInTheDocument()
})
