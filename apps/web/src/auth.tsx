import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'
import { unwrap } from './components/dashboard/queries'

type User = {
    id: string
    email: string
    role: 'user' | 'admin'
}

type AuthContextType = {
    user: User | null
    loading: boolean
    /** throws the ApiError of a refused login; a failed request rejects as is */
    login: (email: string, password: string) => Promise<void>
    logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.auth.me
            .get()
            .then(({ data }) => setUser(data ?? null))
            // No answer at all (network error): same as having no session.
            .catch(() => setUser(null))
            .finally(() => setLoading(false))
    }, [])

    const login = async (email: string, password: string) => {
        setUser(unwrap(await api.auth.login.post({ email, password })))
    }

    const logout = async () => {
        await api.auth.logout.post()
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
