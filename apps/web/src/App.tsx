import { BrowserRouter, Routes, Route, Link } from 'react-router'
import { AuthProvider } from './auth'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'

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
            <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
        </BrowserRouter>
    </AuthProvider>
    )
}

export default App