import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../api'
import { errorMessage, unwrap } from '../components/dashboard/queries'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Field, { describedBy } from '../components/ui/Field'
import Input from '../components/ui/Input'

const passwordHint = 'At least 8 characters'
const linkClass = 'text-link underline'

export default function Register() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)
    const [created, setCreated] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (pending) return

        setError(null)
        setPending(true)
        try {
            unwrap(await api.auth.register.post({ email, password }))
            setCreated(true)
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
                    Create account
                </h1>

                {created ? (
                    <Alert
                        variant="success"
                        action={
                            <Link to="/login" className={linkClass}>
                                Log in
                            </Link>
                        }
                    >
                        Account created. Check your email to verify your
                        address.
                    </Alert>
                ) : (
                    <>
                        {error && <Alert>{error}</Alert>}

                        <form onSubmit={handleSubmit} className="flex flex-col">
                            <Field label="Email" htmlFor="register-email">
                                <Input
                                    id="register-email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    maxLength={254}
                                />
                            </Field>

                            <Field
                                label="Password"
                                htmlFor="register-password"
                                hint={passwordHint}
                            >
                                <Input
                                    id="register-password"
                                    type="password"
                                    autoComplete="new-password"
                                    aria-describedby={describedBy(
                                        'register-password',
                                        { hint: passwordHint },
                                    )}
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    required
                                    minLength={8}
                                    maxLength={128}
                                />
                            </Field>

                            <Button
                                type="submit"
                                disabled={pending}
                                className="mt-1"
                            >
                                Sign up
                            </Button>
                        </form>

                        <p className="text-fg-secondary text-sm text-center">
                            Already have an account?{' '}
                            <Link to="/login" className={linkClass}>
                                Log in
                            </Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
