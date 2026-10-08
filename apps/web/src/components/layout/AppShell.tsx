import { type ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth'
import { errorMessage } from '../dashboard/queries'
import Alert from '../ui/Alert'
import Menu, { MenuItem } from '../ui/Menu'

type Props = {
    /** the buttons of the current page, shown in the bar; the bar knows nothing about them */
    actions?: ReactNode
    children: ReactNode
}

// The frame of every page a logged-in user sees: one top bar, then the page.
export default function AppShell({ actions, children }: Props) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [logoutError, setLogoutError] = useState<string | null>(null)

    const email = user?.email ?? ''

    const handleLogout = async () => {
        setLogoutError(null)
        try {
            await logout()
        } catch (error) {
            // The session is still there: stay on the page and say so.
            setLogoutError(errorMessage(error))
            return
        }
        navigate('/login', { replace: true })
    }

    return (
        <div className="min-h-screen bg-page">
            <header className="flex items-center gap-4 p-4 bg-surface text-fg">
                <Link
                    to="/dashboard"
                    className="min-w-0 truncate text-xl font-bold"
                >
                    Dashboard
                </Link>
                <div className="ml-auto flex shrink-0 items-center gap-4">
                    {actions}
                    <Menu
                        label="Account menu"
                        trigger={
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-semibold hover:bg-primary-hover">
                                {email.charAt(0).toUpperCase()}
                            </span>
                        }
                    >
                        <p
                            title={email}
                            className="truncate border-b border-field-border px-3 py-2 text-sm text-muted"
                        >
                            {email}
                        </p>
                        <MenuItem to="/profile">Profile</MenuItem>
                        <MenuItem to="/settings">Settings</MenuItem>
                        <MenuItem onSelect={handleLogout}>Log out</MenuItem>
                    </Menu>
                </div>
            </header>

            <main className="p-6">
                {logoutError && (
                    <Alert className="mb-4">
                        Couldn't log out. {logoutError}
                    </Alert>
                )}
                {children}
            </main>
        </div>
    )
}
