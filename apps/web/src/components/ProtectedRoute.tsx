import { Navigate } from 'react-router'
import { useAuth } from '../auth'

export default function ProtectedRoute({
    children,
}: {
    children: React.ReactNode
}) {
    const { user, loading } = useAuth()

    if (loading) return <p className="p-8 text-white">Loading...</p>

    if (!user) return <Navigate to="/login" />

    return children
}
