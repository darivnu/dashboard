import { Navigate } from 'react-router'
import { useAuth } from '../auth'
import Spinner from './ui/Spinner'

export default function ProtectedRoute({
    children,
}: {
    children: React.ReactNode
}) {
    const { user, loading } = useAuth()

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <Spinner />
            </div>
        )
    }

    if (!user) return <Navigate to="/login" replace />

    return children
}
