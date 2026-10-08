import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import AppShell from './AppShell'

const auth = vi.hoisted(() => ({
    user: { id: 'u1', email: 'me@example.com', role: 'user' },
    logout: vi.fn(),
}))
vi.mock('../../auth', () => ({ useAuth: () => auth }))

// The shell on /dashboard, next to stand-ins for the pages its menu leads to,
// so a navigation shows up as text.
function renderShell(shell: ReactNode = <AppShell>Page content</AppShell>) {
    return render(
        <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
                <Route path="/dashboard" element={shell} />
                <Route
                    path="/profile"
                    element={<AppShell>Profile page</AppShell>}
                />
                <Route
                    path="/settings"
                    element={<AppShell>Settings page</AppShell>}
                />
                <Route path="/login" element={<p>Login page</p>} />
            </Routes>
        </MemoryRouter>,
    )
}

function banner() {
    return within(screen.getByRole('banner'))
}

async function openMenu() {
    await userEvent.click(
        banner().getByRole('button', { name: 'Account menu' }),
    )
    return screen.getByRole('menu')
}

beforeEach(() => {
    auth.user = { id: 'u1', email: 'me@example.com', role: 'user' }
    auth.logout = vi.fn().mockResolvedValue(undefined)
})

test('draws one bar, with the app name linking to the dashboard', () => {
    renderShell()
    expect(screen.getAllByRole('banner')).toHaveLength(1)
    expect(banner().getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
        'href',
        '/dashboard',
    )
})

test('puts the page in main, under the bar', () => {
    renderShell()
    expect(screen.getByRole('main')).toHaveTextContent('Page content')
    expect(screen.getByRole('banner')).not.toHaveTextContent('Page content')
})

test('shows the action of the page inside the bar', () => {
    renderShell(
        <AppShell actions={<button type="button">Add Widget</button>}>
            Page content
        </AppShell>,
    )
    expect(
        banner().getByRole('button', { name: 'Add Widget' }),
    ).toBeInTheDocument()
})

test('a page that passes no action gets only the account menu', () => {
    renderShell()
    expect(
        banner()
            .getAllByRole('button')
            .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Account menu'])
})

test('the avatar is the first letter of the email, in upper case', () => {
    renderShell()
    expect(
        banner().getByRole('button', { name: 'Account menu' }),
    ).toHaveTextContent(/^M$/)
})

test('nothing of the menu is shown until it is opened', () => {
    renderShell()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByText('me@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText(/log ?out/i)).not.toBeInTheDocument()
})

test('the open menu shows the email, Profile, Settings and Log out, in that order', async () => {
    renderShell()
    const menu = await openMenu()

    expect(Array.from(menu.children).map((el) => el.textContent)).toEqual([
        'me@example.com',
        'Profile',
        'Settings',
        'Log out',
    ])
    expect(
        within(menu)
            .getAllByRole('menuitem')
            .map((el) => el.textContent),
    ).toEqual(['Profile', 'Settings', 'Log out'])
})

test('a long email is cut, with the full address in its title', async () => {
    const email = `${'a-very-long-name'.repeat(6)}@example.com`
    auth.user = { ...auth.user, email }
    renderShell()
    const menu = await openMenu()

    const line = within(menu).getByText(email)
    expect(line).toHaveClass('truncate')
    expect(line).toHaveAttribute('title', email)
    expect(
        banner().getByRole('button', { name: 'Account menu' }),
    ).toHaveTextContent(/^A$/)
})

test.each([
    ['Profile', 'Profile page'],
    ['Settings', 'Settings page'],
])('%s goes to its page and leaves the menu closed', async (name, page) => {
    renderShell()
    const menu = await openMenu()
    await userEvent.click(within(menu).getByRole('menuitem', { name }))

    expect(screen.getByRole('main')).toHaveTextContent(page)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('the app name leads back to the dashboard', async () => {
    renderShell()
    const menu = await openMenu()
    await userEvent.click(
        within(menu).getByRole('menuitem', { name: 'Profile' }),
    )
    await userEvent.click(banner().getByRole('link', { name: 'Dashboard' }))

    expect(screen.getByRole('main')).toHaveTextContent('Page content')
})

test('Log out logs out without asking, then goes to the login page', async () => {
    renderShell()
    const menu = await openMenu()
    await userEvent.click(
        within(menu).getByRole('menuitem', { name: 'Log out' }),
    )

    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(auth.logout).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('waits for the logout to finish before leaving', async () => {
    let finish: () => void = () => {}
    auth.logout = vi.fn(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve
            }),
    )
    renderShell()
    const menu = await openMenu()
    await userEvent.click(
        within(menu).getByRole('menuitem', { name: 'Log out' }),
    )

    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
    finish()
    expect(await screen.findByText('Login page')).toBeInTheDocument()
})

test('a logout that fails stays on the page', async () => {
    auth.logout = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    renderShell()
    const menu = await openMenu()
    await userEvent.click(
        within(menu).getByRole('menuitem', { name: 'Log out' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't log out. Couldn't reach the dashboard server.",
    )
    expect(auth.logout).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Page content')
    expect(banner().getByRole('button', { name: 'Account menu' })).toHaveFocus()
})

test('the logout error goes away on the next try', async () => {
    auth.logout = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(undefined)
    renderShell()
    await userEvent.click(
        within(await openMenu()).getByRole('menuitem', { name: 'Log out' }),
    )
    await screen.findByRole('alert')

    await userEvent.click(
        within(await openMenu()).getByRole('menuitem', { name: 'Log out' }),
    )

    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(auth.logout).toHaveBeenCalledTimes(2)
})

test('shows no alert as long as nothing failed', () => {
    renderShell()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('the bar stays on one row: the name gives way, the rest never shrinks', () => {
    renderShell()
    const name = banner().getByRole('link', { name: 'Dashboard' })
    expect(name).toHaveClass('min-w-0', 'truncate')
    expect(
        banner()
            .getByRole('button', { name: 'Account menu' })
            .closest('.shrink-0'),
    ).not.toBeNull()
    expect(screen.getByRole('banner')).not.toHaveClass('flex-wrap')
})
