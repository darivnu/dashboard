import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import RadioGroup from './RadioGroup'

const OPTIONS = [
    { value: 'small', label: 'Small' },
    { value: 'default', label: 'Default' },
    { value: 'large', label: 'Large' },
    { value: 'xlarge', label: 'Extra large' },
]

/** Controlled host so a keyboard move actually re-renders the checked radio. */
function Harness({
    initial = 'default',
    onChange = () => {},
}: {
    initial?: string
    onChange?: (value: string) => void
}) {
    const [value, setValue] = useState(initial)
    return (
        <RadioGroup
            legend="Text size"
            name="text-size"
            options={OPTIONS}
            value={value}
            onChange={(v) => {
                setValue(v)
                onChange(v)
            }}
        />
    )
}

describe('RadioGroup', () => {
    test('is a group named by its legend, with one radio per option', () => {
        render(<Harness />)

        const group = within(screen.getByRole('group', { name: 'Text size' }))
        expect(
            group.getAllByRole('radio').map((r) => r.getAttribute('value')),
        ).toEqual(['small', 'default', 'large', 'xlarge'])
    })

    test('marks the current value as checked and the others not', () => {
        render(<Harness initial="large" />)

        expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked()
        expect(screen.getByRole('radio', { name: 'Default' })).not.toBeChecked()
    })

    test('calls onChange with the value of the option that is picked', async () => {
        const onChange = vi.fn()
        render(<Harness onChange={onChange} />)

        await userEvent.click(screen.getByRole('radio', { name: 'Small' }))

        expect(onChange).toHaveBeenCalledWith('small')
        expect(screen.getByRole('radio', { name: 'Small' })).toBeChecked()
    })

    test('changes the selection with the arrow keys', async () => {
        const onChange = vi.fn()
        const user = userEvent.setup()
        render(<Harness onChange={onChange} />)

        // Tab lands on the checked radio (Default); arrow moves to the next.
        await user.tab()
        expect(screen.getByRole('radio', { name: 'Default' })).toHaveFocus()
        await user.keyboard('{ArrowDown}')

        expect(onChange).toHaveBeenCalledWith('large')
        expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked()
    })
})
