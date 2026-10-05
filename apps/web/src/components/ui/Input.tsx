import type { InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
    invalid?: boolean
}

const base =
    'w-full p-2 rounded-lg bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 disabled:opacity-50'

export default function Input({
    invalid = false,
    className = '',
    ...rest
}: Props) {
    const ring = invalid ? 'ring-2 ring-red-500' : 'focus:ring-blue-500'
    return (
        <input
            aria-invalid={invalid || undefined}
            className={`${base} ${ring} ${className}`}
            {...rest}
        />
    )
}
