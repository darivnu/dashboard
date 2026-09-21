import { useAuth } from '../auth'
import { useNavigate } from 'react-router'

export default function Dashboard() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const handleLogout = async () => {
    await logout()
    navigate('/login')
    }

    return (
    <div className="min-h-screen bg-gray-900">

        <header className="flex justify-between items-center p-4 bg-gray-800 text-white">
        <h1 className="text-xl font-bold">My Dashboard</h1>
        <div className="flex items-center gap-4">
            <span className="text-gray-300">{user?.email}</span>
            <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition"
            >
            Logout
            </button>
        </div>
        </header>

        <main className="p-8">
        <p className="text-gray-400 text-center text-lg">
            No widgets yet — this is where your widgets will live.
        </p>
        </main>

    </div>
    )
}