import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'
import { unwrap } from './components/dashboard/queries'

type User = {
    id: string
    email: string
    role: 'user' | 'admin'
    createdAt: Date
}

type AuthContextType = {
    user: User | null
    loading: boolean
    /** throws the ApiError of a refused login; a failed request rejects as is */
    login: (email: string, password: string) => Promise<void>
    /** same failures as login; the user stays logged in when it throws */
    logout: () => Promise<void>
    /** same failures as logout; the user stays logged in when it throws */
    deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const queryClient = useQueryClient()

    useEffect(() => {
        api.auth.me
            .get()
            .then(({ data }) => setUser(data ?? null))
            // No answer at all (network error): same as having no session.
            .catch(() => setUser(null))
            .finally(() => setLoading(false))
    }, [])

    const login = async (email: string, password: string) => {
        const user = unwrap(await api.auth.login.post({ email, password }))
        // A request of the last user may have answered after their logout and
        // written into the cache again.
        queryClient.clear()
        setUser(user)
    }

    const logout = async () => {
        // Throws when the server did not end the session: the cookie is still
        // good then, and so is everything below.
        unwrap(await api.auth.logout.post())
        setUser(null)
        // The cache holds the widgets of whoever just left; the next user of
        // this tab must not see them.
        queryClient.clear()
    }

    const deleteAccount = async () => {
        // Throws when the server refused: the account is still there then, and
        // the session with it, so the user stays logged in. On success the
        // server has already expired the session cookie in its response.
        unwrap(await api.auth.me.delete())
        setUser(null)
        queryClient.clear()
    }

    return (
        <AuthContext.Provider
            value={{ user, loading, login, logout, deleteAccount }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
