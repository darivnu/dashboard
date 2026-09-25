import { useState } from 'react'
import { useAuth } from '../auth'
import { useNavigate } from 'react-router'
import WidgetGrid from '../components/WidgetGrid'

type WidgetInstance = {
    id: string
    type: string
    config: Record<string, string | number>
    refreshRate: number
}

export default function Dashboard() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [widgets, setWidgets] = useState<WidgetInstance[]>([
    { id: '1', type: 'weather_city', config: { city: 'Madrid' }, refreshRate: 60 },
    { id: '2', type: 'weather_city', config: { city: 'Paris' }, refreshRate: 120 },
    { id: '3', type: 'rss_list', config: { link: 'https://example.com/rss', number: 5 }, refreshRate: 300 },
    ])

    const handleLogout = async () => {
    await logout()
    navigate('/login')
    }

    const handleDelete = (id: string) => {
    setWidgets(widgets.filter(w => w.id !== id))
    }

    return (
    <div className="min-h-screen bg-gray-900">

        <header className="flex justify-between items-center p-4 bg-gray-800 text-white">
        <h1 className="text-xl font-bold">My Dashboard</h1>
        <div className="flex items-center gap-4">
            <button className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition">
            Add Widget
            </button>
            <span className="text-gray-300">{user?.email}</span>
            <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition"
            >
            Logout
            </button>
        </div>
        </header>

        <main className="p-6">
        <WidgetGrid widgets={widgets} onDelete={handleDelete} />
        </main>

    </div>
    )
}