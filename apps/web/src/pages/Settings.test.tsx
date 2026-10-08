import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import Settings from './Settings'

vi.mock('../auth', () => ({
    useAuth: () => ({
        user: {
            id: 'u1',
            email: 'me@example.com',
            role: 'user',
            createdAt: new Date('2026-09-15T10:00:00Z'),
        },
        logout: vi.fn(),
    }),
}))

const ATTR = 'data-theme'

beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute(ATTR)
})

function renderSettings() {
    return render(
        <MemoryRouter initialEntries={['/settings']}>
            <Settings />
        </MemoryRouter>,
    )
}

function themeGroup() {
    return within(screen.getByRole('group', { name: 'Theme' }))
}

describe('Settings: appearance / theme', () => {
    test('offers a Dark and a Light choice, Dark active by default', () => {
        renderSettings()

        expect(
            themeGroup().getByRole('button', { name: 'Dark' }),
        ).toHaveAttribute('aria-pressed', 'true')
        expect(
            themeGroup().getByRole('button', { name: 'Light' }),
        ).toHaveAttribute('aria-pressed', 'false')
    })

    test('choosing Light switches the theme and sets data-theme on <html>', async () => {
        renderSettings()

        await userEvent.click(
            themeGroup().getByRole('button', { name: 'Light' }),
        )

        expect(document.documentElement.getAttribute(ATTR)).toBe('light')
        expect(
            themeGroup().getByRole('button', { name: 'Light' }),
        ).toHaveAttribute('aria-pressed', 'true')
        expect(
            themeGroup().getByRole('button', { name: 'Dark' }),
        ).toHaveAttribute('aria-pressed', 'false')
    })

    test('choosing Dark again switches back', async () => {
        renderSettings()
        await userEvent.click(
            themeGroup().getByRole('button', { name: 'Light' }),
        )

        await userEvent.click(
            themeGroup().getByRole('button', { name: 'Dark' }),
        )

        expect(document.documentElement.getAttribute(ATTR)).toBe('dark')
        expect(
            themeGroup().getByRole('button', { name: 'Dark' }),
        ).toHaveAttribute('aria-pressed', 'true')
    })
})
