import { createContext, useContext, useState, useEffect } from 'react'
import { api } from './api'

type User = {
    id: string
    email: string
    role: 'user' | 'admin'
}

type AuthContextType = {
    user: User | null
    loading: boolean
    login: (email: string, password: string) => Promise<boolean>
    logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.auth.me.get().then(({ data }) => {
            setUser(data ?? null)
            setLoading(false)
        })
    }, [])

    const login = async (email: string, password: string) => {
        const { data, error } = await api.auth.login.post({ email, password })
        if (error) return false
        setUser(data)
        return true
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
