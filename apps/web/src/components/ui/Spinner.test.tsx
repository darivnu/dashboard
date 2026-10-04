import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import Spinner from './Spinner'

test('announces loading by default', () => {
    render(<Spinner />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
})

test('takes its own label and extra classes', () => {
    render(<Spinner label="Refreshing" className="h-3 w-3" />)
    expect(screen.getByRole('status', { name: 'Refreshing' })).toHaveClass(
        'h-3',
        'animate-spin',
    )
})
