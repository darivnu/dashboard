import { useState } from 'react'
import { api } from '../api'

export default function Register() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const { error } = await api.auth.register.post({
            email,
            password,
        })

        if (error) {
            console.error(error)
            alert('Registration failed')
            return
        }

        alert('Account created! Check your email to verify.')
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
            <form
                onSubmit={handleSubmit}
                className="bg-gray-800 p-8 rounded-xl w-full max-w-md flex flex-col gap-4"
            >
                <h1 className="text-2xl font-bold text-white text-center">
                    Create account
                </h1>

                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                    className="p-3 rounded-lg bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500"
                />

                <input
                    type="password"
                    placeholder="Password (min. 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                    className="p-3 rounded-lg bg-gray-700 text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500"
                />

                <button
                    type="submit"
                    className="p-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 transition"
                >
                    Sign up
                </button>
            </form>
        </div>
    )
}
