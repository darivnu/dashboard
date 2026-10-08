type Props = {
    label?: string
    className?: string
}

export default function Spinner({ label = 'Loading', className = '' }: Props) {
    return (
        <span
            role="status"
            aria-label={label}
            className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-fg ${className}`}
        />
    )
}
