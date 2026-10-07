import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'

function Navbar() {
    const { user, logout } = useAuth()

    return (
        <nav className="px-6 py-3 flex items-center justify-between bg-gray-800 text-white border-b border-gray-700">
            <Link to="/" className="text-lg font-bold tracking-tight">
                ⬡ Dashboard
            </Link>
            <div className="flex items-center gap-4 text-sm">
                {user ? (
                    <>
                        <Link to="/dashboard" className="hover:text-blue-400 transition">
                            My Board
                        </Link>
                        <span className="text-gray-400">{user.email}</span>
                        <button
                            onClick={logout}
                            className="text-red-400 hover:text-red-300 transition"
                        >
                            Logout
                        </button>
                    </>
                ) : (
                    <>
                        <Link to="/login" className="hover:text-blue-400 transition">
                            Log in
                        </Link>
                        <Link
                            to="/register"
                            className="px-3 py-1.5 bg-blue-600 rounded-lg hover:bg-blue-500 transition"
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
        <AuthProvider>
            <BrowserRouter>
                <Navbar />
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    )
}

export default App