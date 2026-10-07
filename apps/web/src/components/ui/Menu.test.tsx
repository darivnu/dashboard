import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { expect, test, vi } from 'vitest'
import Menu, { MenuItem } from './Menu'

// A menu like the one of the top bar: a line of text that is not an item,
// two links and a button. The stand-in routes turn a navigation into text.
function renderMenu(onLogout = vi.fn()) {
    render(
        <MemoryRouter initialEntries={['/']}>
            <Menu label="Account menu" trigger="M">
                <p>me@example.com</p>
                <MenuItem to="/profile">Profile</MenuItem>
                <MenuItem to="/settings">Settings</MenuItem>
                <MenuItem onSelect={onLogout}>Log out</MenuItem>
            </Menu>
            <button type="button">Outside</button>
            <Routes>
                <Route path="/" element={<p>Home page</p>} />
                <Route path="/profile" element={<p>Profile page</p>} />
            </Routes>
        </MemoryRouter>,
    )
    return { onLogout }
}

function trigger() {
    return screen.getByRole('button', { name: 'Account menu' })
}

function item(name: string) {
    return screen.getByRole('menuitem', { name })
}

test('is closed at first: no menu, and the trigger says so', () => {
    renderMenu()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveTextContent('M')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
})

test('a click opens it and focuses the first item', async () => {
    renderMenu()
    await userEvent.click(trigger())

    expect(screen.getByRole('menu')).toBeVisible()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(item('Profile')).toHaveFocus()
})

test.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
])('%s on the trigger opens it and focuses the first item', async (_, key) => {
    renderMenu()
    trigger().focus()
    await userEvent.keyboard(key)

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(item('Profile')).toHaveFocus()
})

test('the items are links or buttons with the menuitem role', async () => {
    renderMenu()
    await userEvent.click(trigger())

    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(
        ['Profile', 'Settings', 'Log out'],
    )
    expect(item('Profile')).toHaveAttribute('href', '/profile')
    expect(item('Settings')).toHaveAttribute('href', '/settings')
    expect(item('Log out').tagName).toBe('BUTTON')
})

test('ArrowDown and ArrowUp move between the items and wrap', async () => {
    renderMenu()
    await userEvent.click(trigger())

    await userEvent.keyboard('{ArrowDown}')
    expect(item('Settings')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(item('Log out')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(item('Profile')).toHaveFocus()

    await userEvent.keyboard('{ArrowUp}')
    expect(item('Log out')).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(item('Settings')).toHaveFocus()
})

test('Home and End go to the first and the last item', async () => {
    renderMenu()
    await userEvent.click(trigger())

    await userEvent.keyboard('{End}')
    expect(item('Log out')).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(item('Profile')).toHaveFocus()
})

test('Escape closes it and gives the focus back to the trigger', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{ArrowDown}{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveFocus()
})

test('a press outside closes it', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.click(screen.getByText('Home page'))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('a press inside, on something that is not an item, keeps it open', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.click(screen.getByText('me@example.com'))

    expect(screen.getByRole('menu')).toBeVisible()
})

test('it closes when the focus leaves it', async () => {
    renderMenu()
    await userEvent.click(trigger())
    // The items are out of the Tab order, so Tab lands on what follows the menu.
    await userEvent.tab()

    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('a second click on the trigger closes it', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.click(trigger())

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
})

test('choosing a button item runs it once and closes the menu', async () => {
    const { onLogout } = renderMenu()
    await userEvent.click(trigger())
    await userEvent.click(item('Log out'))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('choosing a button item gives the focus back to the trigger', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{End}{Enter}')

    expect(trigger()).toHaveFocus()
})

test('Enter on a button item chooses it', async () => {
    const { onLogout } = renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{End}{Enter}')

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('choosing a link item goes to its page and closes the menu', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.click(item('Profile'))

    expect(screen.getByText('Profile page')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('it can be opened again after it was closed', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard('{Enter}')

    expect(item('Profile')).toHaveFocus()
})

test('Space on a link item chooses it, like Enter', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard(' ')

    expect(screen.getByText('Profile page')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

test('Space on a button item runs it once', async () => {
    const { onLogout } = renderMenu()
    await userEvent.click(trigger())
    await userEvent.keyboard('{End} ')

    expect(onLogout).toHaveBeenCalledTimes(1)
})

test('Tab closes it when the focus leaves the page altogether', async () => {
    renderMenu()
    await userEvent.click(trigger())

    // What Tab on the last element of a page does: the focus goes to the
    // browser's own buttons, and nothing in the page receives it.
    fireEvent.keyDown(item('Profile'), { key: 'Tab' })
    item('Profile').blur()

    await waitFor(() =>
        expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    )
})

test('Shift+Tab back to the trigger keeps it open', async () => {
    renderMenu()
    await userEvent.click(trigger())
    await userEvent.tab({ shift: true })
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(trigger()).toHaveFocus()
    expect(screen.getByRole('menu')).toBeVisible()
})

test('the panel is never wider than the screen', async () => {
    renderMenu()
    await userEvent.click(trigger())

    expect(screen.getByRole('menu')).toHaveClass(
        'right-0',
        'max-w-[calc(100vw-2rem)]',
    )
})
