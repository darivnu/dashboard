import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import Alert from './Alert'
import Button from './Button'

test('is an error alert by default', () => {
    render(<Alert>The service isn't responding right now.</Alert>)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("The service isn't responding right now.")
    expect(alert).toHaveClass('text-red-200')
})

test('an info alert is a polite status', () => {
    render(<Alert variant="info">No stations to show.</Alert>)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No stations to show.')
})

test('shows an action next to the message', () => {
    render(<Alert action={<Button>Try again</Button>}>Failed</Alert>)
    expect(
        screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
})
