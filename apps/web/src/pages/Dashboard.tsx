import { useState, useEffect } from 'react'
import { useAuth } from '../auth'
import { useNavigate } from 'react-router'
import WidgetGrid from '../components/WidgetGrid'
import { api } from '../api'

type WidgetInstance = {
    id: string
    serviceId: string
    widgetId: string
    title: string | null
    params: Record<string, string | number>
    refreshSeconds: number
}

export default function Dashboard() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [widgets, setWidgets] = useState<WidgetInstance[]>([])

    useEffect(() => {
        api.dashboard.instances.get().then(({ data, error }) => {
            if (error) {
            console.error(error)
            return
            }
            setWidgets(data?.instances ?? [])
        })
    }, [])

    const handleLogout = async () => {
    await logout()
    navigate('/login')
    }

    const handleDelete = async (id: string) => {
        const { error } = await api.dashboard.instances({ id }).delete()
        if (error) {
            console.error(error)
            alert('Failed to delete widget')
            return
        }
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