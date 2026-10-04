import type { ReactNode } from 'react'

type Variant = 'error' | 'info'

const variants: Record<Variant, string> = {
    error: 'bg-red-950/50 border-red-800 text-red-200',
    info: 'bg-gray-700/50 border-gray-600 text-gray-300',
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
