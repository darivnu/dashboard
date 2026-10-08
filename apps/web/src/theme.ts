import { useSyncExternalStore } from 'react'
import { readPreference, subscribe, writePreference } from './preferences'

export type Theme = 'dark' | 'light'

/** The active theme: the stored choice, or dark when none is stored. */
export function getThemePreference(): Theme {
    return readPreference('theme') as Theme
}

/** Switches the theme for this page at once and remembers the choice. */
export function setThemePreference(theme: Theme): void {
    writePreference('theme', theme)
}

/** Reads the theme and re-renders the caller whenever it changes. */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
    const theme = useSyncExternalStore(
        subscribe,
        getThemePreference,
        getThemePreference,
    )
    return { theme, setTheme: setThemePreference }
}
