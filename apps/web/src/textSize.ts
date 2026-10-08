import { useSyncExternalStore } from 'react'
import { readPreference, subscribe, writePreference } from './preferences'

export type TextSize = 'small' | 'default' | 'large' | 'xlarge'

// The visible steps. The percentages live in index.css (on html[data-text-size]);
// here we only need the order and the labels the Settings control shows.
export const TEXT_SIZES: { value: TextSize; label: string }[] = [
    { value: 'small', label: 'Small' },
    { value: 'default', label: 'Default' },
    { value: 'large', label: 'Large' },
    { value: 'xlarge', label: 'Extra large' },
]

/** The active text size: the stored choice, or "default" when none is stored. */
export function getTextSizePreference(): TextSize {
    return readPreference('textSize') as TextSize
}

/** Applies the size for this page at once and remembers the choice. */
export function setTextSizePreference(size: TextSize): void {
    writePreference('textSize', size)
}

/** Reads the text size and re-renders the caller whenever it changes. */
export function useTextSize(): {
    textSize: TextSize
    setTextSize: (size: TextSize) => void
} {
    const textSize = useSyncExternalStore(
        subscribe,
        getTextSizePreference,
        getTextSizePreference,
    )
    return { textSize, setTextSize: setTextSizePreference }
}
