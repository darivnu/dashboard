import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthProvider, useAuth } from './auth'
import { ApiError } from './components/dashboard/queries'
import { apiMock, fail, ok, resetApiMock } from './test/apiMock'
import { renderWithQuery } from './test/renderWithQuery'

vi.mock('./api', async () => (await import('./test/apiMock')).apiModule)

const user = { id: 'u1', email: 'me@example.com', role: 'user' }

// Shows what the context holds, and what a login or logout attempt resolved
// or threw.
function Probe() {
    const { user, loading, login, logout } = useAuth()
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
            <button
                type="button"
                onClick={() =>
                    logout().then(
                        () => setOutcome('logged out'),
                        (error) => setOutcome(`other: ${String(error)}`),
                    )
                }
            >
                log out
            </button>
            <p>{outcome}</p>
        </>
    )
}

// The provider empties the query cache on logout, so it needs one around it.
function renderProbe() {
    return renderWithQuery(
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

test('logout tells the API, forgets the user and empties the query cache', async () => {
    apiMock.me.mockResolvedValue(ok(user))
    apiMock.logout.mockResolvedValue(ok({ ok: true }))
    const { client } = renderProbe()
    await screen.findByText('me@example.com')
    client.setQueryData(['instances'], [{ id: 'widget-of-the-last-user' }])

    await userEvent.click(screen.getByRole('button', { name: 'log out' }))

    expect(await screen.findByText('logged out')).toBeInTheDocument()
    expect(apiMock.logout).toHaveBeenCalledTimes(1)
    expect(screen.getByText('no user')).toBeInTheDocument()
    expect(client.getQueryCache().getAll()).toEqual([])
})

test('a logout that never reaches the server keeps the user and the cache', async () => {
    apiMock.me.mockResolvedValue(ok(user))
    apiMock.logout.mockRejectedValue(new TypeError('Failed to fetch'))
    const { client } = renderProbe()
    await screen.findByText('me@example.com')
    client.setQueryData(['instances'], [{ id: 'my-widget' }])

    await userEvent.click(screen.getByRole('button', { name: 'log out' }))

    await waitFor(() =>
        expect(
            screen.getByText('other: TypeError: Failed to fetch'),
        ).toBeInTheDocument(),
    )
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    expect(client.getQueryCache().getAll()).toHaveLength(1)
})

test('a logout the server refuses throws, and keeps the user and the cache', async () => {
    apiMock.me.mockResolvedValue(ok(user))
    apiMock.logout.mockResolvedValue(fail(500, 'INTERNAL', 'Something broke'))
    const { client } = renderProbe()
    await screen.findByText('me@example.com')
    client.setQueryData(['instances'], [{ id: 'my-widget' }])

    await userEvent.click(screen.getByRole('button', { name: 'log out' }))

    expect(
        await screen.findByText('other: ApiError: Something broke'),
    ).toBeInTheDocument()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    expect(client.getQueryCache().getAll()).toHaveLength(1)
})

test('login starts from an empty query cache', async () => {
    apiMock.login.mockResolvedValue(ok(user))
    const { client } = renderProbe()
    await screen.findByText('no user')
    // Left behind by a request of the last user that answered after their logout.
    client.setQueryData(['instances'], [{ id: 'widget-of-the-last-user' }])

    await userEvent.click(screen.getByRole('button', { name: 'log in' }))

    expect(await screen.findByText('me@example.com')).toBeInTheDocument()
    expect(client.getQueryCache().getAll()).toEqual([])
})

test('a refused login leaves the query cache alone', async () => {
    apiMock.login.mockResolvedValue(
        fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
    )
    const { client } = renderProbe()
    await screen.findByText('no user')
    client.setQueryData(['catalog'], [])

    await userEvent.click(screen.getByRole('button', { name: 'log in' }))

    await screen.findByText(/ApiError 401/)
    expect(client.getQueryCache().getAll()).toHaveLength(1)
})
