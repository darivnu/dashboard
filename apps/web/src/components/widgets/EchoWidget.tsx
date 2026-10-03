import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { WidgetProps } from '../widgetRegistry'

export default function EchoWidget({
    instanceId,
    refreshSeconds,
}: WidgetProps) {
    const [data, setData] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const fetchData = () => {
        api.dashboard
            .instances({ id: instanceId })
            .data.get()
            .then(({ data: res, error: err }) => {
                if (err || !res) {
                    setError('Failed to fetch')
                    return
                }
                if (!res.ok) {
                    setError(res.code)
                    return
                }
                setData(res.data)
                setError(null)
            })
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, refreshSeconds * 1000)
        return () => clearInterval(interval)
    }, [])

    if (error) return <p className="text-red-400 text-sm">{error}</p>
    if (!data) return <p className="text-gray-400 text-sm">Loading...</p>

    return (
        <div className="text-white text-sm">
            <p className="text-lg font-bold">{data.message}</p>
            <p className="text-gray-400 text-xs mt-1">Count: {data.count}</p>
        </div>
    )
}
