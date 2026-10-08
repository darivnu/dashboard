// Attribute-backed user preferences: a value kept in localStorage that also
// lives as an attribute on <html>, so CSS can react to it. Today it holds only
// the theme; the Settings issue adds text size as one more row here and in the
// matching array of the index.html bootstrap script.

type PreferenceDef = {
    /** localStorage key */
    key: string
    /** attribute set on <html> */
    attribute: string
    /** the values that are allowed; anything else falls back */
    values: readonly string[]
    /** used when nothing valid is stored, or storage is unreachable */
    fallback: string
}

export const preferences = {
    theme: {
        key: 'dashboard.theme',
        attribute: 'data-theme',
        values: ['dark', 'light'],
        fallback: 'dark',
    },
} satisfies Record<string, PreferenceDef>

export type PreferenceName = keyof typeof preferences

const listeners = new Set<() => void>()

/** The stored value if it is one of the allowed ones, else the fallback. */
export function readPreference(name: PreferenceName): string {
    const def = preferences[name]
    try {
        const stored = localStorage.getItem(def.key)
        if (stored !== null && def.values.includes(stored)) return stored
    } catch {
        // localStorage can be absent or blocked (private mode, no-storage).
    }
    return def.fallback
}

/** Stores the value, sets the attribute on <html> and notifies subscribers. */
export function writePreference(name: PreferenceName, value: string): void {
    const def = preferences[name]
    try {
        localStorage.setItem(def.key, value)
    } catch {
        // A failed store is not fatal: the attribute still changes for this
        // page, the choice just will not survive a reload.
    }
    document.documentElement.setAttribute(def.attribute, value)
    for (const listener of listeners) listener()
}

/** Calls the listener after any writePreference. Returns an unsubscribe. */
export function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}
