import { useEffect, useState } from 'react'
import { api } from './api'

function App() {
    const [msg, setMsg] = useState('cargando...')

    useEffect(() => {
    api.health.get().then(({ data, error }) => {
        setMsg(error ? '❌ error' : JSON.stringify(data))
    })
    }, [])

    return <h1 className="text-3xl text-red-600 p-8">Back dice: {msg}</h1>
}
export default App