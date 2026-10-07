import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'dangerGhost'

const base =
    'rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
    primary: 'px-4 py-2 bg-blue-600 text-white hover:bg-blue-500',
    secondary: 'px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500',
    danger: 'px-4 py-2 bg-red-600 text-white hover:bg-red-500',
    ghost: 'px-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
    dangerGhost: 'text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant
}

export default function Button({
    variant = 'primary',
    type = 'button',
    className = '',
    ...rest
}: Props) {
    return (
        <button
            type={type}
            className={`${base} ${variants[variant]} ${className}`}
            {...rest}
        />
    )
}
