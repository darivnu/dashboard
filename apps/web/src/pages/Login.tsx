import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth'
import { errorMessage } from '../components/dashboard/queries'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Input from '../components/ui/Input'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (pending) return

        setError(null)
        setPending(true)
        try {
            await login(email, password)
            navigate('/dashboard', { replace: true })
        } catch (error) {
            setError(errorMessage(error))
        } finally {
            setPending(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="bg-surface p-8 rounded-xl w-full max-w-md flex flex-col gap-4">
                <h1 className="text-2xl font-bold text-fg text-center">
                    Log in
                </h1>

                {error && <Alert>{error}</Alert>}

                <form onSubmit={handleSubmit} className="flex flex-col">
                    <Field label="Email" htmlFor="login-email">
                        <Input
                            id="login-email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            maxLength={254}
                        />
                    </Field>

                    <Field label="Password" htmlFor="login-password">
                        <Input
                            id="login-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            maxLength={128}
                        />
                    </Field>

                    <Button type="submit" disabled={pending} className="mt-1">
                        Log in
                    </Button>
                </form>

                <p className="text-fg-secondary text-sm text-center">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-link underline">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    )
}
