/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** AdviceWidget
 */

import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { WidgetProps } from '../widgetRegistry'

export default function AdviceWidget({
    instanceId,
    refreshSeconds,
}: WidgetProps) {
    // biome-ignore lint/suspicious/noExplicitAny: legacy widget, to be migrated to the widget base
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

    // biome-ignore lint/correctness/useExhaustiveDependencies: legacy widget, to be migrated to the widget base
    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, refreshSeconds * 1000)
        return () => clearInterval(interval)
    }, [])

    if (error) return <p className="text-red-400 text-sm">{error}</p>
    if (!data) return <p className="text-gray-400 text-sm">Loading...</p>

    return <p className="text-white text-lg italic">“{data.advice}”</p>
}
