import { type ReactNode, useEffect, useId, useRef } from 'react'
import Button from './Button'

type Props = {
    open: boolean
    onClose: () => void
    title: string
    children: ReactNode
}

export default function Dialog({ open, onClose, title, children }: Props) {
    const ref = useRef<HTMLDialogElement>(null)
    const titleId = useId()

    // The native element is opened and closed with methods, not with a prop:
    // showModal() is what gives the backdrop, the focus trap and Escape.
    useEffect(() => {
        const dialog = ref.current
        if (!dialog) return
        if (open && !dialog.open) dialog.showModal()
        if (!open && dialog.open) dialog.close()
    }, [open])

    return (
        <dialog
            ref={ref}
            aria-labelledby={titleId}
            // Fired by Escape and by close(); keeps the parent's state in step.
            onClose={onClose}
            className="m-auto bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto backdrop:bg-black/50"
        >
            {open && (
                <>
                    <div className="flex justify-between items-center mb-4">
                        <h2 id={titleId} className="text-xl font-bold">
                            {title}
                        </h2>
                        <Button variant="ghost" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                    {children}
                </>
            )}
        </dialog>
    )
}
