import type { InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
    invalid?: boolean
}

const base =
    'w-full p-2 rounded-lg bg-surface-raised text-fg placeholder-muted border border-field-border outline-none focus:ring-2 disabled:opacity-50'

export default function Input({
    invalid = false,
    className = '',
    ...rest
}: Props) {
    const ring = invalid ? 'ring-2 ring-danger' : 'focus:ring-focus'
    return (
        <input
            aria-invalid={invalid || undefined}
            className={`${base} ${ring} ${className}`}
            {...rest}
        />
    )
}
