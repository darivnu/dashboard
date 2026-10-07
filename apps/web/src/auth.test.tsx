import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthProvider, useAuth } from './auth'
import { ApiError } from './components/dashboard/queries'
import { apiMock, fail, ok, resetApiMock } from './test/apiMock'

vi.mock('./api', async () => (await import('./test/apiMock')).apiModule)

const user = { id: 'u1', email: 'me@example.com', role: 'user' }

// Shows what the context holds, and what a login attempt resolved or threw.
function Probe() {
    const { user, loading, login } = useAuth()
    const [outcome, setOutcome] = useState('')

    const attempt = async () => {
        try {
            const result = await login('me@example.com', 'password1')
            setOutcome(`resolved: ${String(result)}`)
        } catch (error) {
            setOutcome(
                error instanceof ApiError
                    ? `ApiError ${error.status} ${error.code}: ${error.message}`
                    : `other: ${String(error)}`,
            )
        }
    }

    return (
        <>
            <p>{loading ? 'loading' : (user?.email ?? 'no user')}</p>
            <button type="button" onClick={attempt}>
                log in
            </button>
            <p>{outcome}</p>
        </>
    )
}

function renderProbe() {
    return render(
        <AuthProvider>
            <Probe />
        </AuthProvider>,
    )
}

beforeEach(() => {
    resetApiMock()
    apiMock.me.mockResolvedValue(fail(401, 'UNAUTHORIZED', 'Not logged in'))
})

test('loads the session and leaves loading', async () => {
    apiMock.me.mockResolvedValue(ok(user))
    renderProbe()
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(await screen.findByText('me@example.com')).toBeInTheDocument()
})

test('leaves loading with no user when there is no session', async () => {
    renderProbe()
    expect(await screen.findByText('no user')).toBeInTheDocument()
})

test('leaves loading with no user when the session request rejects', async () => {
    apiMock.me.mockRejectedValue(new TypeError('Failed to fetch'))
    renderProbe()
    expect(await screen.findByText('no user')).toBeInTheDocument()
})

test('login resolves with nothing and stores the user', async () => {
    apiMock.login.mockResolvedValue(ok(user))
    renderProbe()
    await screen.findByText('no user')

    await userEvent.click(screen.getByRole('button', { name: 'log in' }))

    expect(await screen.findByText('resolved: undefined')).toBeInTheDocument()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    expect(apiMock.login).toHaveBeenCalledWith({
        email: 'me@example.com',
        password: 'password1',
    })
})

test('login throws the ApiError of a refused login and stores no user', async () => {
    apiMock.login.mockResolvedValue(
        fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
    )
    renderProbe()
    await screen.findByText('no user')

    await userEvent.click(screen.getByRole('button', { name: 'log in' }))

    expect(
        await screen.findByText(
            'ApiError 401 INVALID_CREDENTIALS: Invalid email or password',
        ),
    ).toBeInTheDocument()
    expect(screen.getByText('no user')).toBeInTheDocument()
})

test('login lets a rejected request through', async () => {
    apiMock.login.mockRejectedValue(new TypeError('Failed to fetch'))
    renderProbe()
    await screen.findByText('no user')

    await userEvent.click(screen.getByRole('button', { name: 'log in' }))

    expect(
        await screen.findByText('other: TypeError: Failed to fetch'),
    ).toBeInTheDocument()
})
