import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api'
import { errorMessage, unwrap } from '../components/dashboard/queries'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Input from '../components/ui/Input'

type Status = 'verifying' | 'verified' | 'invalid'

// Target of the link in the verification email: /verify-email?token=...
// Posts the token once on load, then offers a resend when it was rejected.
export default function VerifyEmail() {
    const [params] = useSearchParams()
    const token = params.get('token') ?? ''

    const [status, setStatus] = useState<Status>(
        token ? 'verifying' : 'invalid',
    )
    const [email, setEmail] = useState('')
    const [resent, setResent] = useState(false)
    const [resendError, setResendError] = useState<string | null>(null)
    const [pending, setPending] = useState(false)

    // A token is single-use, so the request must go out exactly once even when
    // React StrictMode runs the effect twice in development.
    const started = useRef(false)

    useEffect(() => {
        if (!token || started.current) return
        started.current = true

        api.auth['verify-email'].post({ token }).then(({ error }) => {
            setStatus(error ? 'invalid' : 'verified')
        })
    }, [token])

    const handleResend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (pending) return

        setResendError(null)
        setPending(true)
        try {
            // Always answers ok, whether or not the address has an unverified
            // account; only a request that did not go through fails here.
            unwrap(await api.auth['resend-verification'].post({ email }))
            setResent(true)
        } catch (error) {
            setResendError(errorMessage(error))
        } finally {
            setPending(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
            <div className="bg-gray-800 p-8 rounded-xl w-full max-w-md flex flex-col gap-4 text-center">
                {status === 'verifying' && (
                    <h1 className="text-2xl font-bold text-white">
                        Verifying your email…
                    </h1>
                )}

                {status === 'verified' && (
                    <>
                        <h1 className="text-2xl font-bold text-white">
                            Email verified
                        </h1>
                        <p className="text-gray-300">Your account is ready.</p>
                        <Link
                            to="/login"
                            className="p-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition"
                        >
                            Log in
                        </Link>
                    </>
                )}

                {status === 'invalid' && (
                    <>
                        <h1 className="text-2xl font-bold text-white">
                            This link is invalid or has expired
                        </h1>

                        {resent ? (
                            <p className="text-gray-300">
                                If an account with that email is waiting for
                                verification, a new link is on its way.
                            </p>
                        ) : (
                            <form
                                onSubmit={handleResend}
                                className="flex flex-col text-left"
                            >
                                <p className="text-gray-300 text-center mb-4">
                                    Enter your email to receive a new link.
                                </p>
                                {resendError && (
                                    <Alert className="mb-4">
                                        {resendError}
                                    </Alert>
                                )}
                                <Field
                                    label="Email"
                                    htmlFor="verify-email-address"
                                >
                                    <Input
                                        id="verify-email-address"
                                        type="email"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) =>
                                            setEmail(e.target.value)
                                        }
                                        required
                                        maxLength={254}
                                    />
                                </Field>
                                <Button
                                    type="submit"
                                    disabled={pending}
                                    className="mt-1"
                                >
                                    Send a new link
                                </Button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
