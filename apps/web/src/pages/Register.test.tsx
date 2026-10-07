import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { apiMock, fail, ok, resetApiMock } from '../test/apiMock'
import Register from './Register'

vi.mock('../api', async () => (await import('../test/apiMock')).apiModule)

function renderRegister() {
    return render(
        <MemoryRouter initialEntries={['/register']}>
            <Register />
        </MemoryRouter>,
    )
}

async function submit(email = 'new@example.com', password = 'password1') {
    await userEvent.type(screen.getByLabelText('Email'), email)
    await userEvent.type(screen.getByLabelText('Password'), password)
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))
}

beforeEach(() => {
    resetApiMock()
})

test('every input is reachable by its label', () => {
    renderRegister()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute(
        'type',
        'password',
    )
})

test('the password field carries its hint', () => {
    renderRegister()
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
        'At least 8 characters',
    )
})

test('the inputs keep their constraints and tell the browser what to fill in', () => {
    renderRegister()
    const email = screen.getByLabelText('Email')
    expect(email).toBeRequired()
    expect(email).toHaveAttribute('maxlength', '254')
    expect(email).toHaveAttribute('autocomplete', 'email')

    const password = screen.getByLabelText('Password')
    expect(password).toBeRequired()
    expect(password).toHaveAttribute('minlength', '8')
    expect(password).toHaveAttribute('maxlength', '128')
    expect(password).toHaveAttribute('autocomplete', 'new-password')
})

test('a created account replaces the form with the check-your-email message', async () => {
    apiMock.register.mockResolvedValue({
        ...ok({ id: 'u2', email: 'new@example.com' }),
        status: 201,
    })
    renderRegister()

    await submit()

    expect(await screen.findByRole('status')).toHaveTextContent(
        'Account created. Check your email to verify your address.',
    )
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
        'href',
        '/login',
    )
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(
        screen.queryByRole('button', { name: 'Sign up' }),
    ).not.toBeInTheDocument()
    expect(apiMock.register).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'password1',
    })
})

test('a taken email shows the message of the API and keeps the form', async () => {
    apiMock.register.mockResolvedValue(
        fail(409, 'EMAIL_TAKEN', 'An account with this email already exists'),
    )
    renderRegister()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'An account with this email already exists',
    )
    expect(screen.getByLabelText('Email')).toHaveValue('new@example.com')
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('a request that never reaches the server says so', async () => {
    apiMock.register.mockRejectedValue(new TypeError('Failed to fetch'))
    renderRegister()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't reach the dashboard server.",
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('a failure is not written to the console', async () => {
    const consoleError = vi.spyOn(console, 'error')
    apiMock.register.mockResolvedValue(
        fail(409, 'EMAIL_TAKEN', 'An account with this email already exists'),
    )
    renderRegister()

    await submit()
    await screen.findByRole('alert')

    expect(consoleError).not.toHaveBeenCalled()
})

test('the error is cleared on the next submit', async () => {
    apiMock.register.mockResolvedValueOnce(
        fail(409, 'EMAIL_TAKEN', 'An account with this email already exists'),
    )
    renderRegister()
    await submit()
    await screen.findByRole('alert')

    // The second answer never arrives, so the page stays in its pending state.
    apiMock.register.mockReturnValue(new Promise(() => {}))
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('the submit button is disabled while the request is pending', async () => {
    let answer: (value: unknown) => void = () => {}
    apiMock.register.mockReturnValue(
        new Promise((resolve) => {
            answer = resolve
        }),
    )
    renderRegister()
    const button = screen.getByRole('button', { name: 'Sign up' })
    expect(button).toBeEnabled()

    await submit()
    expect(button).toBeDisabled()
    // Enter in a field submits the form without going through the button.
    fireEvent.submit(button.closest('form') as HTMLFormElement)

    answer(
        fail(409, 'EMAIL_TAKEN', 'An account with this email already exists'),
    )
    await screen.findByRole('alert')
    expect(button).toBeEnabled()
    expect(apiMock.register).toHaveBeenCalledTimes(1)
})

test('links to the login page', () => {
    renderRegister()
    expect(screen.getByText(/Already have an account\?/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
        'href',
        '/login',
    )
})
