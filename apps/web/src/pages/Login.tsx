import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { githubLoginUrl } from '../api'
import { useAuth } from '../auth'
import { errorMessage } from '../components/dashboard/queries'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Input from '../components/ui/Input'

// One message per ?oauth_error= code the GitHub login redirects with
const oauthErrorMessages: Record<string, string> = {
    invalid_state: 'Sign-in failed. Please try again.',
    expired: 'Sign-in took too long. Please try again.',
    denied: 'GitHub sign-in was cancelled.',
    provider_error: 'GitHub reported an error. Please try again.',
    exchange_failed: 'Could not reach GitHub. Please try again.',
    session_mismatch: 'Your session changed during sign-in. Please try again.',
    no_verified_email:
        "Your GitHub primary email isn't verified. Verify it on GitHub, then try again.",
    email_unverified:
        "An account with this email exists but isn't verified yet. Check your inbox for the verification link.",
    identity_taken: 'This GitHub account is already linked to another user.',
    account_disabled: 'This account has been disabled.',
}
const OAUTH_FALLBACK = 'GitHub sign-in failed. Please try again.'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [searchParams, setSearchParams] = useSearchParams()
    const oauthError = searchParams.get('oauth_error')
    const [error, setError] = useState<string | null>(
        oauthError ? (oauthErrorMessages[oauthError] ?? OAUTH_FALLBACK) : null,
    )
    const [pending, setPending] = useState(false)
    const { login } = useAuth()
    const navigate = useNavigate()

    // The message is already in `error`: drop the param so a refresh doesn't show it again.
    useEffect(() => {
        if (oauthError) {
            setSearchParams({}, { replace: true })
        }
    }, [oauthError, setSearchParams])

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

                <Button
                    variant="secondary"
                    onClick={() => window.location.assign(githubLoginUrl())}
                >
                    Continue with GitHub
                </Button>

                <p className="text-gray-300 text-sm text-center">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-link underline">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    )
}
