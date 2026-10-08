import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Dialog from '../ui/Dialog'

type Props = {
    open: boolean
    title: string
    message: string
    confirmLabel: string
    busy?: boolean
    error?: string | null
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel,
    busy = false,
    error,
    onConfirm,
    onCancel,
}: Props) {
    return (
        <Dialog open={open} onClose={onCancel} title={title}>
            {error && <Alert className="mb-3">{error}</Alert>}
            <p className="text-fg-secondary mb-4">{message}</p>
            <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button variant="danger" onClick={onConfirm} disabled={busy}>
                    {confirmLabel}
                </Button>
            </div>
        </Dialog>
    )
}
