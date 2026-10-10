import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { AppRoutes } from './App'
import { AuthProvider } from './auth'
import { apiMock, fail, makeInstance, ok, resetApiMock } from './test/apiMock'
import { renderWithQuery } from './test/renderWithQuery'

vi.mock('./api', async () => (await import('./test/apiMock')).apiModule)

const user = { id: 'u1', email: 'me@example.com', role: 'user' }

// Prints the address the router is on, so a test can read where it ended up,
// and stands in for the Back button of the browser.
function Address() {
    const { pathname, search } = useLocation()
    const navigate = useNavigate()
    return (
        <>
            <p data-testid="address">{pathname + search}</p>
            <button type="button" onClick={() => navigate(-1)}>
                Browser back
            </button>
        </>
    )
}

// The real routes and the real AuthProvider over the fake API, in a router
// that keeps the address in memory.
// Several addresses: the history of the tab, the last one being the current.
function renderApp(...history: string[]) {
    return renderWithQuery(
        <AuthProvider>
            <MemoryRouter initialEntries={history}>
                <AppRoutes />
                <Address />
            </MemoryRouter>
        </AuthProvider>,
    )
}

function loggedIn() {
    apiMock.me.mockResolvedValue(ok(user))
}

async function endsOn(address: string) {
    await waitFor(() =>
        expect(screen.getByTestId('address')).toHaveTextContent(address),
    )
    // Not while the session is still being checked.
    await waitFor(() =>
        expect(
            screen.queryByRole('status', { name: 'Loading' }),
        ).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('address').textContent).toBe(address)
}

beforeEach(() => {
    resetApiMock()
    apiMock.me.mockResolvedValue(fail(401, 'UNAUTHORIZED', 'Not logged in'))
    apiMock.listInstances.mockResolvedValue(ok({ instances: [] }))
    apiMock.catalog.mockResolvedValue(
        ok({
            services: [
                {
                    id: 'github',
                    name: 'GitHub',
                    auth: { kind: 'oauth2' },
                    subscription: null,
                    widgets: [],
                },
            ],
        }),
    )
    apiMock.verifyEmail.mockResolvedValue(ok({ ok: true }))
})

test.each([
    ['/login', 'Log in'],
    ['/register', 'Create account'],
    ['/verify-email?token=abc', 'Email verified'],
])(
    'logged out, %s shows its page with no bar, no nav and no way to the dashboard',
    async (path, heading) => {
        renderApp(path)

        expect(
            await screen.findByRole('heading', { name: heading }),
        ).toBeInTheDocument()
        await endsOn(path)
        expect(screen.queryByRole('banner')).not.toBeInTheDocument()
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
        for (const link of screen.queryAllByRole('link')) {
            expect(link).not.toHaveAttribute('href', '/dashboard')
            expect(link).not.toHaveTextContent('Dashboard')
        }
    },
)

test.each(['/login', '/register', '/', '/no-such-page'])(
    'logged in, %s ends on the dashboard',
    async (path) => {
        loggedIn()
        renderApp(path)

        await endsOn('/dashboard')
        expect(
            screen.getByRole('heading', { name: 'My Dashboard' }),
        ).toBeInTheDocument()
    },
)

test.each(['/dashboard', '/profile', '/settings', '/', '/no-such-page'])(
    'logged out, %s ends on the login page',
    async (path) => {
        renderApp(path)

        await endsOn('/login')
        expect(
            screen.getByRole('heading', { name: 'Log in' }),
        ).toBeInTheDocument()
        expect(apiMock.listInstances).not.toHaveBeenCalled()
    },
)

test('logged in, the verify-email page stays reachable', async () => {
    loggedIn()
    renderApp('/verify-email?token=abc')

    expect(
        await screen.findByRole('heading', { name: 'Email verified' }),
    ).toBeInTheDocument()
    await endsOn('/verify-email?token=abc')
})

test.each([
    '/login',
    '/register',
    '/dashboard',
    '/profile',
    '/',
    '/no-such-page',
])(
    'while the session is loading, %s shows a spinner and nothing else',
    (path) => {
        // The answer never arrives.
        apiMock.me.mockReturnValue(new Promise(() => {}))
        renderApp(path)

        expect(screen.getByRole('status', { name: 'Loading' })).toBeVisible()
        expect(screen.getByTestId('address')).toHaveTextContent(path)
        expect(screen.queryByRole('banner')).not.toBeInTheDocument()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.queryByRole('heading')).not.toBeInTheDocument()
        expect(apiMock.listInstances).not.toHaveBeenCalled()
    },
)

test('logged in, no Login, Register or Dashboard nav link is left', async () => {
    loggedIn()
    renderApp('/dashboard')
    await endsOn('/dashboard')

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(
        screen.queryByRole('link', { name: /^(log ?in|register|sign up)$/i }),
    ).not.toBeInTheDocument()
    // The only "Dashboard" link is the app name of the bar.
    const bar = screen.getByRole('banner')
    expect(screen.getAllByRole('link', { name: 'Dashboard' })).toEqual([
        within(bar).getByRole('link', { name: 'Dashboard' }),
    ])
})

test('the dashboard has one bar with the app name, Add Widget and the account menu', async () => {
    loggedIn()
    renderApp('/dashboard')
    await endsOn('/dashboard')

    expect(screen.getAllByRole('banner')).toHaveLength(1)
    const bar = within(screen.getByRole('banner'))
    expect(bar.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    expect(bar.getByRole('button', { name: 'Add Widget' })).toBeVisible()
    expect(bar.getByRole('button', { name: 'Account menu' })).toBeVisible()
    expect(
        screen.queryByRole('button', { name: /log ?out/i }),
    ).not.toBeInTheDocument()
    expect(
        screen.queryByRole('menuitem', { name: /log ?out/i }),
    ).not.toBeInTheDocument()
})

test.each([
    ['/profile', 'Profile'],
    ['/settings', 'Settings'],
])(
    '%s shows the same bar without Add Widget, and its title',
    async (path, title) => {
        loggedIn()
        renderApp(path)
        await endsOn(path)

        expect(screen.getAllByRole('banner')).toHaveLength(1)
        const bar = within(screen.getByRole('banner'))
        expect(bar.getByRole('link', { name: 'Dashboard' })).toBeVisible()
        expect(bar.getByRole('button', { name: 'Account menu' })).toBeVisible()
        expect(
            screen.queryByRole('button', { name: 'Add Widget' }),
        ).not.toBeInTheDocument()
        expect(
            within(screen.getByRole('main')).getByRole('heading', {
                level: 1,
                name: title,
            }),
        ).toBeVisible()
    },
)

test.each([
    ['Profile', '/profile'],
    ['Settings', '/settings'],
])(
    'the menu item %s goes to its page and the menu is closed afterwards',
    async (name, path) => {
        loggedIn()
        renderApp('/dashboard')
        await endsOn('/dashboard')

        await userEvent.click(
            screen.getByRole('button', { name: 'Account menu' }),
        )
        await userEvent.click(screen.getByRole('menuitem', { name }))

        await endsOn(path)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Account menu' }),
        ).toHaveAttribute('aria-expanded', 'false')
    },
)

test('the app name brings back to the dashboard from another page', async () => {
    loggedIn()
    renderApp('/settings')
    await endsOn('/settings')

    await userEvent.click(screen.getByRole('link', { name: 'Dashboard' }))
    await endsOn('/dashboard')
})

test('Log out tells the API, empties the query cache and lands on the login page', async () => {
    loggedIn()
    apiMock.listInstances.mockResolvedValue(
        ok({ instances: [makeInstance({ title: 'Mine' })] }),
    )
    apiMock.instanceData.mockResolvedValue(
        ok({ ok: true, data: { message: 'hi' }, fetchedAt: '2026-10-07' }),
    )
    apiMock.logout.mockResolvedValue(ok({ ok: true }))
    const { client } = renderApp('/dashboard')
    await screen.findByRole('article', { name: 'Mine' })
    expect(client.getQueryCache().getAll()).not.toEqual([])

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))

    await endsOn('/login')
    expect(apiMock.logout).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(client.getQueryCache().getAll()).toEqual([])
})

test('a login made on the login page ends on the dashboard', async () => {
    apiMock.login.mockResolvedValue(ok(user))
    renderApp('/login')
    await screen.findByRole('heading', { name: 'Log in' })

    await userEvent.type(screen.getByLabelText('Email'), 'me@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password1')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await endsOn('/dashboard')
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeVisible()
})

test('the answer of an account connection survives the redirects', async () => {
    loggedIn()
    renderApp('/dashboard?connected=github')

    expect(await screen.findByText('GitHub is connected.')).toBeVisible()
    // The notice removes its parameter once read.
    await endsOn('/dashboard')
})

test('a refused account connection still shows its reason', async () => {
    loggedIn()
    renderApp('/dashboard?oauth_error=denied')

    expect(
        await screen.findByText('The connection was cancelled.'),
    ).toBeVisible()
})

// /verify-email is public in both states, so it can be "the page before".
test('logged out, Back after being sent to the login page leaves it', async () => {
    renderApp('/verify-email', '/dashboard')
    await endsOn('/login')

    await userEvent.click(screen.getByRole('button', { name: 'Browser back' }))
    await endsOn('/verify-email')
})

test('logged in, Back after being sent to the dashboard leaves it', async () => {
    loggedIn()
    renderApp('/verify-email', '/login')
    await endsOn('/dashboard')

    await userEvent.click(screen.getByRole('button', { name: 'Browser back' }))
    await endsOn('/verify-email')
})

test('Back after an unknown address does not return to it', async () => {
    loggedIn()
    renderApp('/verify-email', '/no-such-page')
    await endsOn('/dashboard')

    await userEvent.click(screen.getByRole('button', { name: 'Browser back' }))
    await endsOn('/verify-email')
})

test('Back after logging out does not return to the dashboard', async () => {
    loggedIn()
    apiMock.logout.mockResolvedValue(ok({ ok: true }))
    renderApp('/verify-email', '/dashboard')
    await endsOn('/dashboard')

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))
    await endsOn('/login')

    await userEvent.click(screen.getByRole('button', { name: 'Browser back' }))
    await endsOn('/verify-email')
})

test('Back after logging in does not return to the login form', async () => {
    apiMock.login.mockResolvedValue(ok(user))
    renderApp('/verify-email', '/login')
    await screen.findByRole('heading', { name: 'Log in' })

    await userEvent.type(screen.getByLabelText('Email'), 'me@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password1')
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await endsOn('/dashboard')

    await userEvent.click(screen.getByRole('button', { name: 'Browser back' }))
    await endsOn('/verify-email')
})

test('a layout save that answers after the logout does not hand the widgets to the next user', async () => {
    loggedIn()
    const mine = [
        makeInstance({ title: 'A', x: 0, y: 0 }),
        makeInstance({ title: 'B', x: 4, y: 0 }),
    ]
    apiMock.listInstances.mockResolvedValue(ok({ instances: mine }))
    apiMock.instanceData.mockResolvedValue(
        ok({ ok: true, data: { message: 'hi' }, fetchedAt: '2026-10-07' }),
    )
    apiMock.logout.mockResolvedValue(ok({ ok: true }))
    let answerSave: (value: unknown) => void = () => {}
    apiMock.saveLayout.mockReturnValue(
        new Promise((resolve) => {
            answerSave = resolve
        }),
    )
    const { client } = renderApp('/dashboard')
    const cardA = await screen.findByRole('article', { name: 'A' })

    await userEvent.click(
        within(cardA).getByRole('button', { name: 'Move later' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))
    await endsOn('/login')
    // The save answers now, and writes the old user's widgets into the cache.
    answerSave(ok({ instances: mine }))
    await waitFor(() =>
        expect(client.getQueryData(['instances'])).toBeDefined(),
    )

    apiMock.listInstances.mockReturnValue(new Promise(() => {}))
    await userEvent.type(screen.getByLabelText('Email'), 'me@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password1')
    apiMock.login.mockResolvedValue(ok({ ...user, id: 'u2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

    await endsOn('/dashboard')
    expect(
        screen.getByRole('status', { name: 'Loading dashboard' }),
    ).toBeVisible()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
})
