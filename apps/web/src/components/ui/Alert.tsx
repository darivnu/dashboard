import type { ReactNode } from 'react'

type Variant = 'error' | 'info' | 'success'

const variants: Record<Variant, string> = {
    error: 'bg-danger-subtle border-danger-border text-danger-fg',
    info: 'bg-surface-raised border-border text-fg-secondary',
    success: 'bg-success-subtle border-success-border text-success-fg',
}

type Props = {
    variant?: Variant
    /** a button or link shown under the message */
    action?: ReactNode
    className?: string
    children: ReactNode
}

export default function Alert({
    variant = 'error',
    action,
    className = '',
    children,
}: Props) {
    return (
        <div
            // An error interrupts a screen reader; an info message waits its turn.
            role={variant === 'error' ? 'alert' : 'status'}
            className={`rounded-lg border p-3 text-sm flex flex-col items-start gap-2 ${variants[variant]} ${className}`}
        >
            <p>{children}</p>
            {action}
        </div>
    )
}
