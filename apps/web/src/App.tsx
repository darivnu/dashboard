import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import { ThemeProvider, useTheme } from './theme'

function ThemeToggle() {
    const { theme, toggle } = useTheme()
    return (
        <button
            onClick={toggle}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="text-lg hover:scale-110 transition"
        >
            {theme === 'dark' ? '☀️' : '🌙'}
        </button>
    )
}

function LogoutConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={onCancel}
        >
            <div
                className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-lg"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                    Log out?
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                    Are you sure you want to log out of your account?
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition"
                    >
                        Log out
                    </button>
                </div>
            </div>
        </div>
    )
}

function ProfileMenu() {
    const { user, logout } = useAuth()
    const [open, setOpen] = useState(false)
    const [confirming, setConfirming] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    // close dropdown on outside click
    useEffect(() => {
        if (!open) return
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    if (!user) return null

    const initial = user.email.charAt(0).toUpperCase()

    return (
        <>
            <div className="relative" ref={ref}>
                <button
                    onClick={() => setOpen((o) => !o)}
                    aria-label="Open profile menu"
                    className="w-9 h-9 rounded-full bg-blue-600 text-white font-semibold flex items-center justify-center hover:bg-blue-500 transition"
                >
                    {initial}
                </button>

                {open && (
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-blue-100 dark:border-gray-700 rounded-xl shadow-lg py-2 z-40">
                        <div className="px-4 py-2 border-b border-blue-100 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {user.email}
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                setOpen(false)
                                setConfirming(true)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700 transition"
                        >
                            Log out
                        </button>
                    </div>
                )}
            </div>

            {confirming && (
                <LogoutConfirm
                    onConfirm={() => {
                        setConfirming(false)
                        logout()
                    }}
                    onCancel={() => setConfirming(false)}
                />
            )}
        </>
    )
}

function Navbar() {
    const { user } = useAuth()

    return (
        <nav className="px-6 py-3 flex items-center justify-between bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-b border-blue-100 dark:border-gray-700">
            <Link to="/" className="text-lg font-bold tracking-tight">
                ⬡ Dashboard
            </Link>
            <div className="flex items-center gap-4 text-sm">
                <ThemeToggle />
                {user ? (
                    <>
                        <Link to="/dashboard" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                            My Board
                        </Link>
                        <ProfileMenu />
                    </>
                ) : (
                    <>
                        <Link to="/login" className="hover:text-blue-600 dark:hover:text-blue-400 transition">
                            Log in
                        </Link>
                        <Link
                            to="/register"
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition"
                        >
                            Sign up
                        </Link>
                    </>
                )}
            </div>
        </nav>
    )
}

function AppRoutes() {
    const { user, loading } = useAuth()
    if (loading) return null
    return (
        <Routes>
            <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route
                path="/dashboard"
                element={
                    <ProtectedRoute>
                        <Dashboard />
                    </ProtectedRoute>
                }
            />
        </Routes>
    )
}

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <BrowserRouter>
                    <Navbar />
                    <AppRoutes />
                </BrowserRouter>
            </AuthProvider>
        </ThemeProvider>
    )
}

export default App 