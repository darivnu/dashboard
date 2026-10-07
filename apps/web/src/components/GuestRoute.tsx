import { Navigate } from 'react-router'
import { useAuth } from '../auth'
import Spinner from './ui/Spinner'

// The mirror of ProtectedRoute, for the pages a logged-in user has no use
// for: the login and register forms.
export default function GuestRoute({
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

    if (user) return <Navigate to="/dashboard" replace />

    return children
}
