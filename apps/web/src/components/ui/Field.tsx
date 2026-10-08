import type { ReactNode } from 'react'

type Props = {
    label: string
    /** id of the control inside; the error and hint ids are derived from it */
    htmlFor: string
    required?: boolean
    error?: string
    hint?: string
    children: ReactNode
}

/** ids to put in the control's aria-describedby, or undefined when there are none */
export function describedBy(
    htmlFor: string,
    { error, hint }: { error?: string; hint?: string },
) {
    const ids = [
        hint ? `${htmlFor}-hint` : null,
        error ? `${htmlFor}-error` : null,
    ].filter(Boolean)
    return ids.length > 0 ? ids.join(' ') : undefined
}

export default function Field({
    label,
    htmlFor,
    required = false,
    error,
    hint,
    children,
}: Props) {
    return (
        <div className="mb-3">
            <label
                htmlFor={htmlFor}
                className="text-fg-secondary text-sm block mb-1"
            >
                {label}
                {required && (
                    <span className="text-danger-fg" aria-hidden="true">
                        {' '}
                        *
                    </span>
                )}
            </label>
            {children}
            {hint && (
                <p id={`${htmlFor}-hint`} className="text-muted text-xs mt-1">
                    {hint}
                </p>
            )}
            {error && (
                <p
                    id={`${htmlFor}-error`}
                    role="alert"
                    className="text-danger-fg text-sm mt-1"
                >
                    {error}
                </p>
            )}
        </div>
    )
}
