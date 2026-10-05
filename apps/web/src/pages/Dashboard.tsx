import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth'
import AddWidgetDialog from '../components/dashboard/AddWidgetDialog'
import ApiKeyDialog from '../components/dashboard/ApiKeyDialog'
import ConfirmDialog from '../components/dashboard/ConfirmDialog'
import EditWidgetDialog from '../components/dashboard/EditWidgetDialog'
import {
    layoutChanges,
    move,
    pack,
    sortByPosition,
} from '../components/dashboard/layout'
import OAuthNotice from '../components/dashboard/OAuthNotice'
import {
    errorMessage,
    useDeleteInstance,
    useInstances,
    useSaveLayout,
} from '../components/dashboard/queries'
import type { Instance } from '../components/dashboard/types'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import WidgetGrid from '../components/WidgetGrid'

export default function Dashboard() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const instances = useInstances()
    const saveLayout = useSaveLayout()
    const remove = useDeleteInstance()

    const [adding, setAdding] = useState(false)
    // Ids, not the instances themselves: the dialogs always get the current
    // version from the list.
    const [editingId, setEditingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [apiKeyId, setApiKeyId] = useState<string | null>(null)

    const list = instances.data ?? []
    const editing = list.find((instance) => instance.id === editingId) ?? null
    const apiKeyFor = list.find((instance) => instance.id === apiKeyId) ?? null
    const deleting = list.find((instance) => instance.id === deletingId) ?? null

    const deletingName = deleting
        ? (deleting.title ?? `${deleting.serviceId} / ${deleting.widgetId}`)
        : ''

    const handleLogout = async () => {
        await logout()
        navigate('/login')
    }

    const handleMove = (instance: Instance, direction: 'left' | 'right') => {
        const changes = layoutChanges(list, move(list, instance.id, direction))
        if (changes.length > 0) saveLayout.mutate(changes)
    }

    const handleDelete = () => {
        if (!deleting) return
        remove.mutate(deleting.id, {
            onSuccess: () => {
                setDeletingId(null)
                // Close the gap the deleted card leaves behind.
                const rest = list.filter((other) => other.id !== deleting.id)
                const changes = layoutChanges(rest, pack(sortByPosition(rest)))
                if (changes.length > 0) saveLayout.mutate(changes)
            },
        })
    }

    const cancelDelete = () => {
        setDeletingId(null)
        remove.reset()
    }

    return (
        <div className="min-h-screen bg-gray-900">
            <header className="flex justify-between items-center p-4 bg-gray-800 text-white">
                <h1 className="text-xl font-bold">My Dashboard</h1>
                <div className="flex items-center gap-4">
                    <Button onClick={() => setAdding(true)}>Add Widget</Button>
                    <span className="text-gray-300">{user?.email}</span>
                    <Button variant="danger" onClick={handleLogout}>
                        Logout
                    </Button>
                </div>
            </header>

            <main className="p-6">
                <OAuthNotice />
                {saveLayout.isError && (
                    <Alert className="mb-4">
                        The new layout couldn't be saved.{' '}
                        {errorMessage(saveLayout.error)}
                    </Alert>
                )}

                {instances.isPending ? (
                    <div className="flex justify-center mt-12">
                        <Spinner label="Loading dashboard" />
                    </div>
                ) : instances.isError ? (
                    <Alert
                        action={
                            <Button
                                variant="secondary"
                                onClick={() => instances.refetch()}
                            >
                                Try again
                            </Button>
                        }
                    >
                        {errorMessage(instances.error)}
                    </Alert>
                ) : (
                    <WidgetGrid
                        instances={list}
                        onEdit={(instance) => setEditingId(instance.id)}
                        onDelete={(instance) => setDeletingId(instance.id)}
                        onMove={handleMove}
                        onSetApiKey={(instance) => setApiKeyId(instance.id)}
                    />
                )}
            </main>

            <AddWidgetDialog
                open={adding}
                onClose={() => setAdding(false)}
                instances={list}
            />
            <EditWidgetDialog
                instance={editing}
                onClose={() => setEditingId(null)}
                instances={list}
            />
            <ApiKeyDialog
                instance={apiKeyFor}
                onClose={() => setApiKeyId(null)}
            />
            <ConfirmDialog
                open={deleting !== null}
                title="Delete widget"
                message={`Delete "${deletingName}"? This cannot be undone.`}
                confirmLabel="Delete"
                busy={remove.isPending}
                error={remove.isError ? errorMessage(remove.error) : null}
                onConfirm={handleDelete}
                onCancel={cancelDelete}
            />
        </div>
    )
}
