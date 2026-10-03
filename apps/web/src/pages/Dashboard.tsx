import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { useAuth } from '../auth'
import AddWidgetModal from '../components/AddWidgetModal'
import WidgetGrid from '../components/WidgetGrid'

type WidgetInstance = {
    id: string
    serviceId: string
    widgetId: string
    title: string | null
    params: Record<string, string | number>
    refreshSeconds: number
    x: number
    y: number
    w: number
    h: number
}

export default function Dashboard() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [widgets, setWidgets] = useState<WidgetInstance[]>([])
    const [modalOpen, setModalOpen] = useState(false)

    useEffect(() => {
        api.dashboard.instances.get().then(({ data, error }) => {
            if (error) {
                console.error(error)
                return
            }
            setWidgets(data?.instances ?? [])
        })
    }, [])

    const reloadWidgets = () => {
        api.dashboard.instances.get().then(({ data, error }) => {
            if (error) return
            setWidgets(data?.instances ?? [])
        })
    }

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
        setWidgets(widgets.filter((w) => w.id !== id))
    }

    const handleMove = async (id: string, direction: 'left' | 'right') => {
        const index = widgets.findIndex((w) => w.id === id)
        if (index === -1) return

        const newWidgets = [...widgets]
        if (direction === 'left' && index > 0) {
            ;[newWidgets[index - 1], newWidgets[index]] = [
                newWidgets[index],
                newWidgets[index - 1],
            ]
        } else if (direction === 'right' && index < newWidgets.length - 1) {
            ;[newWidgets[index], newWidgets[index + 1]] = [
                newWidgets[index + 1],
                newWidgets[index],
            ]
        } else {
            return
        }

        setWidgets(newWidgets)

        // Actualiza las posiciones en el back
        const updates = newWidgets.map((w, i) => ({
            id: w.id,
            x: i * 4,
            y: w.y,
            w: w.w,
            h: w.h,
        }))

        const { error } = await api.dashboard.layout.patch(updates)

        if (error) {
            console.error(error.value)
            reloadWidgets()
        }
    }

    return (
        <div className="min-h-screen bg-gray-900">
            <header className="flex justify-between items-center p-4 bg-gray-800 text-white">
                <h1 className="text-xl font-bold">My Dashboard</h1>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setModalOpen(true)}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition"
                    >
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
                <WidgetGrid
                    widgets={widgets}
                    onDelete={handleDelete}
                    onMove={handleMove}
                />
            </main>
            <AddWidgetModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onCreated={reloadWidgets}
            />
        </div>
    )
}
