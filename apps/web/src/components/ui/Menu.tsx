import {
    createContext,
    type KeyboardEvent,
    type ReactNode,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import { Link } from 'react-router'

// Gives every item the way to close the menu it sits in; `refocus` puts the
// focus back on the trigger, for an item that stays on the page.
const MenuContext = createContext<(refocus?: boolean) => void>(() => {})

const itemClass =
    'block w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 focus:bg-gray-700 focus:outline-hidden'

// Read from the page each time: the items are whatever the children drew.
function itemsOf(root: HTMLElement | null) {
    return Array.from(
        root?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
}

type Props = {
    /** accessible name of the trigger and of the menu */
    label: string
    /** what the trigger button shows */
    trigger: ReactNode
    children: ReactNode
}

export default function Menu({ label, trigger, children }: Props) {
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (!open) return
        itemsOf(rootRef.current)[0]?.focus()

        // A press or a focus that lands anywhere else closes the menu.
        const closeIfOutside = (event: Event) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('pointerdown', closeIfOutside)
        document.addEventListener('focusin', closeIfOutside)
        return () => {
            document.removeEventListener('pointerdown', closeIfOutside)
            document.removeEventListener('focusin', closeIfOutside)
        }
    }, [open])

    const close = (refocus = false) => {
        setOpen(false)
        if (refocus) triggerRef.current?.focus()
    }

    // On the trigger and on the panel: the focus is always in one of the two.
    const handleKeyDown = (event: KeyboardEvent) => {
        if (!open) return
        if (event.key === 'Escape') {
            close(true)
            return
        }
        // Tab can also leave the page for the browser's own buttons, and no
        // focusin tells about that. So look where the focus is once it moved.
        if (event.key === 'Tab') {
            setTimeout(() => {
                if (!rootRef.current?.contains(document.activeElement)) {
                    setOpen(false)
                }
            })
            return
        }
        // A button already takes Space as a click; a link only takes Enter.
        if (
            event.key === ' ' &&
            document.activeElement instanceof HTMLAnchorElement
        ) {
            event.preventDefault()
            document.activeElement.click()
            return
        }

        const items = itemsOf(rootRef.current)
        const current = items.indexOf(document.activeElement as HTMLElement)
        const last = items.length - 1
        const targets: Record<string, number> = {
            ArrowDown: current === last ? 0 : current + 1,
            ArrowUp: current <= 0 ? last : current - 1,
            Home: 0,
            End: last,
        }
        const next = targets[event.key]
        if (next === undefined) return

        // Without this the arrows would also scroll the page.
        event.preventDefault()
        items[next]?.focus()
    }

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                ref={triggerRef}
                type="button"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                onKeyDown={handleKeyDown}
                className="block rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
                {trigger}
            </button>
            {open && (
                <div
                    role="menu"
                    aria-label={label}
                    onKeyDown={handleKeyDown}
                    className="absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-lg"
                >
                    <MenuContext.Provider value={close}>
                        {children}
                    </MenuContext.Provider>
                </div>
            )}
        </div>
    )
}

type ItemProps =
    | { to: string; onSelect?: never; children: ReactNode }
    | { to?: never; onSelect: () => void; children: ReactNode }

// tabIndex -1: the items are reached with the arrows, not with Tab, and a
// press still gives them the focus in every browser.
export function MenuItem({ to, onSelect, children }: ItemProps) {
    const close = useContext(MenuContext)

    if (to !== undefined) {
        return (
            <Link
                to={to}
                role="menuitem"
                tabIndex={-1}
                onClick={() => close()}
                className={itemClass}
            >
                {children}
            </Link>
        )
    }
    return (
        <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
                close(true)
                onSelect()
            }}
            className={itemClass}
        >
            {children}
        </button>
    )
}
