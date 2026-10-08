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

beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-text-size')
})

function renderSettings() {
    return render(
        <MemoryRouter initialEntries={['/settings']}>
            <Settings />
        </MemoryRouter>,
    )
}

function group(name: string) {
    return within(screen.getByRole('group', { name }))
}

describe('Settings: text size', () => {
    test('offers the four steps, Default selected on first visit', () => {
        renderSettings()

        expect(
            group('Text size')
                .getAllByRole('radio')
                .map((r) => r.getAttribute('value')),
        ).toEqual(['small', 'default', 'large', 'xlarge'])
        expect(
            group('Text size').getByRole('radio', { name: 'Default' }),
        ).toBeChecked()
    })

    test('choosing a step sets data-text-size on <html> and stores it', async () => {
        renderSettings()

        await userEvent.click(
            group('Text size').getByRole('radio', { name: 'Large' }),
        )

        expect(document.documentElement.getAttribute('data-text-size')).toBe(
            'large',
        )
        expect(localStorage.getItem('dashboard.textSize')).toBe('large')
        expect(
            group('Text size').getByRole('radio', { name: 'Large' }),
        ).toBeChecked()
    })
})

describe('Settings: theme', () => {
    test('offers Light and Dark, Dark selected by default', () => {
        renderSettings()

        expect(
            group('Theme')
                .getAllByRole('radio')
                .map((r) => r.getAttribute('value')),
        ).toEqual(['light', 'dark'])
        expect(
            group('Theme').getByRole('radio', { name: 'Dark' }),
        ).toBeChecked()
    })

    test('choosing Light switches the theme on <html>', async () => {
        renderSettings()

        await userEvent.click(
            group('Theme').getByRole('radio', { name: 'Light' }),
        )

        expect(document.documentElement.getAttribute('data-theme')).toBe(
            'light',
        )
        expect(
            group('Theme').getByRole('radio', { name: 'Light' }),
        ).toBeChecked()
    })
})
