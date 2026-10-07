import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import Alert from '../components/ui/Alert'

export default function Register() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSubmitting(true)
        const { error: err } = await api.auth.register.post({ email, password })
        setSubmitting(false)
        if (err) {
            setError('Registration failed. Try a different email.')
            return
        }
        setSuccess(true)
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-blue-50 dark:bg-gray-900 px-4">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-xl w-full max-w-md text-center flex flex-col gap-4 shadow-sm dark:shadow-none border border-blue-100 dark:border-transparent">
                    <p className="text-green-600 dark:text-green-400 text-lg font-semibold">✓ Account created!</p>
                    <p className="text-gray-700 dark:text-gray-300">Check your email to verify, then log in.</p>
                    <button
                        onClick={() => navigate('/login')}
                        className="p-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition"
                    >
                        Go to login
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-blue-50 dark:bg-gray-900 px-4">
            <form
                onSubmit={handleSubmit}
                className="bg-white dark:bg-gray-800 p-8 rounded-xl w-full max-w-md flex flex-col gap-4 shadow-sm dark:shadow-none border border-blue-100 dark:border-transparent"
            >
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center">Create account</h1>

                {error && <Alert>{error}</Alert>}

                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                    disabled={submitting}
                    className="p-3 rounded-lg bg-blue-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />

                <input
                    type="password"
                    placeholder="Password (min. 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    disabled={submitting}
                    className="p-3 rounded-lg bg-blue-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />

                <button
                    type="submit"
                    disabled={submitting}
                    className="p-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {submitting ? 'Creating…' : 'Sign up'}
                </button>
            </form>
        </div>
    )
}