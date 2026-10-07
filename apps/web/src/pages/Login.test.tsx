import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthProvider } from '../auth'
import { apiMock, fail, ok, resetApiMock } from '../test/apiMock'
import Login from './Login'

vi.mock('../api', async () => (await import('../test/apiMock')).apiModule)

const user = { id: 'u1', email: 'me@example.com', role: 'user' }

// The real AuthProvider over the fake API, and a stand-in for the dashboard
// route so a navigation shows up as text.
function renderLogin() {
    return render(
        <AuthProvider>
            <MemoryRouter initialEntries={['/login']}>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/dashboard" element={<p>Dashboard page</p>} />
                </Routes>
            </MemoryRouter>
        </AuthProvider>,
    )
}

async function submit(email = 'me@example.com', password = 'password1') {
    await userEvent.type(screen.getByLabelText('Email'), email)
    await userEvent.type(screen.getByLabelText('Password'), password)
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

beforeEach(() => {
    resetApiMock()
    apiMock.me.mockResolvedValue(fail(401, 'UNAUTHORIZED', 'Not logged in'))
})

test('every input is reachable by its label', () => {
    renderLogin()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute(
        'type',
        'password',
    )
})

test('the inputs keep their constraints and tell the browser what to fill in', () => {
    renderLogin()
    const email = screen.getByLabelText('Email')
    expect(email).toBeRequired()
    expect(email).toHaveAttribute('maxlength', '254')
    expect(email).toHaveAttribute('autocomplete', 'email')

    const password = screen.getByLabelText('Password')
    expect(password).toBeRequired()
    expect(password).toHaveAttribute('minlength', '8')
    expect(password).toHaveAttribute('maxlength', '128')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
})

test('a successful login goes to the dashboard', async () => {
    apiMock.login.mockResolvedValue(ok(user))
    renderLogin()

    await submit()

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument()
    expect(apiMock.login).toHaveBeenCalledWith({
        email: 'me@example.com',
        password: 'password1',
    })
})

test('wrong credentials show the message of the API and stay on the page', async () => {
    apiMock.login.mockResolvedValue(
        fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
    )
    renderLogin()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Invalid email or password',
    )
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('me@example.com')
})

test('an unverified account is told to verify its email', async () => {
    apiMock.login.mockResolvedValue(
        fail(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before logging in'),
    )
    renderLogin()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Verify your email before logging in',
    )
})

test('a request that never reaches the server says so', async () => {
    apiMock.login.mockRejectedValue(new TypeError('Failed to fetch'))
    renderLogin()

    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't reach the dashboard server.",
    )
})

test('the error is cleared on the next submit', async () => {
    apiMock.login.mockResolvedValueOnce(
        fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
    )
    renderLogin()
    await submit()
    await screen.findByRole('alert')

    // The second answer never arrives, so the page stays in its pending state.
    apiMock.login.mockReturnValue(new Promise(() => {}))
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('the submit button is disabled while the request is pending', async () => {
    let answer: (value: unknown) => void = () => {}
    apiMock.login.mockReturnValue(
        new Promise((resolve) => {
            answer = resolve
        }),
    )
    renderLogin()
    const button = screen.getByRole('button', { name: 'Log in' })
    expect(button).toBeEnabled()

    await submit()
    expect(button).toBeDisabled()
    // Enter in a field submits the form without going through the button.
    fireEvent.submit(button.closest('form') as HTMLFormElement)

    answer(fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password'))
    await screen.findByRole('alert')
    expect(button).toBeEnabled()
    expect(apiMock.login).toHaveBeenCalledTimes(1)
})

test('links to the register page', () => {
    renderLogin()
    expect(screen.getByText(/Don't have an account\?/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
        'href',
        '/register',
    )
})
