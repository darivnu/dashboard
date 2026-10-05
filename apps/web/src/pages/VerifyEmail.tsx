import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../api'

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
        // Always answers ok, whether or not the address has an unverified account.
        await api.auth['resend-verification'].post({ email })
        setResent(true)
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
                                className="flex flex-col gap-4"
                            >
                                <p className="text-gray-300">
                                    Enter your email to receive a new link.
                                </p>
                                <input
                                    type="email"
                                    placeholder="Email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    maxLength={254}
                                    className="p-3 rounded-lg bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    type="submit"
                                    className="p-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition"
                                >
                                    Send a new link
                                </button>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
