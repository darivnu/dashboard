import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { AuthProvider } from './auth'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <nav className="p-4 flex gap-4 bg-gray-800 text-white">
                    <Link to="/login">Login</Link>
                    <Link to="/register">Register</Link>
                    <Link to="/dashboard">Dashboard</Link>
                </nav>

                <Routes>
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
            </BrowserRouter>
        </AuthProvider>
    )
}

export default App
