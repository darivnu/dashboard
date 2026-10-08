import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'
import { getThemePreference, setThemePreference, useTheme } from './theme'

const ATTR = 'data-theme'

beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute(ATTR)
})

describe('getThemePreference / setThemePreference', () => {
    test('defaults to dark when nothing is stored', () => {
        expect(getThemePreference()).toBe('dark')
    })

    test('setThemePreference sets data-theme on <html> and is read back', () => {
        setThemePreference('light')

        expect(document.documentElement.getAttribute(ATTR)).toBe('light')
        expect(getThemePreference()).toBe('light')
    })
})

describe('useTheme', () => {
    function ThemeProbe() {
        const { theme, setTheme } = useTheme()
        return (
            <>
                <p>theme: {theme}</p>
                <button type="button" onClick={() => setTheme('light')}>
                    go light
                </button>
            </>
        )
    }

    test('reflects the current theme and updates when it changes', async () => {
        render(<ThemeProbe />)
        expect(screen.getByText('theme: dark')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'go light' }))

        expect(screen.getByText('theme: light')).toBeInTheDocument()
        expect(document.documentElement.getAttribute(ATTR)).toBe('light')
    })
})

// The inline script in index.html must set the theme before the bundle runs,
// so the first paint is never the wrong theme. Pull it out of the file and run
// it the way the browser would.
describe('the index.html inline script', () => {
    function inlineScript() {
        const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
        // The first <script> with no attributes is the theme bootstrap; the
        // module script carries type="module".
        const match = html.match(/<script>\s*([\s\S]*?)<\/script>/)
        if (!match) throw new Error('no inline script found in index.html')
        return match[1]
    }

    test('applies the stored theme', () => {
        localStorage.setItem('dashboard.theme', 'light')

        new Function(inlineScript())()

        expect(document.documentElement.getAttribute(ATTR)).toBe('light')
    })

    test('falls back to dark when nothing is stored', () => {
        new Function(inlineScript())()

        expect(document.documentElement.getAttribute(ATTR)).toBe('dark')
    })
})
