import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth'
import Alert from '../components/ui/Alert'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSubmitting(true)

        const success = await login(email, password)
        setSubmitting(false)

        if (!success) {
            setError('Invalid email or password.')
            return
        }
        navigate('/dashboard')
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
            <form
                onSubmit={handleSubmit}
                className="bg-gray-800 p-8 rounded-xl w-full max-w-md flex flex-col gap-4"
            >
                <h1 className="text-2xl font-bold text-white text-center">Log in</h1>

                {error && <Alert>{error}</Alert>}

                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                    disabled={submitting}
                    className="p-3 rounded-lg bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />

                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    disabled={submitting}
                    className="p-3 rounded-lg bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />

                <button
                    type="submit"
                    disabled={submitting}
                    className="p-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submitting ? 'Logging in…' : 'Log in'}
                </button>
            </form>
        </div>
    )
}