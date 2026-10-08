import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'dangerGhost'

const base =
    'rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
    primary: 'px-4 py-2 bg-primary text-on-accent hover:bg-primary-hover',
    secondary: 'px-4 py-2 bg-neutral text-fg hover:bg-neutral-hover',
    danger: 'px-4 py-2 bg-danger text-on-accent hover:bg-danger-hover',
    ghost: 'px-1 text-sm text-muted hover:text-fg',
    dangerGhost: 'text-sm text-danger-fg hover:underline',
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
