import { useState, useEffect } from 'react'
import { api } from '../../api'
import type { WidgetProps } from '../widgetRegistry'

// La forma de una peli, igual que la devuelve el back (interface Film).
type Film = {
    film: string | null
    year: number | null
    rating: number | null
    watchedDate: string | null
    rewatch: boolean
    poster: string | null
    link: string | null
}

export default function LetterboxdWidget({ instanceId, refreshSeconds }: WidgetProps) {
    const [films, setFilms] = useState<Film[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    const fetchData = () => {
        api.dashboard.instances({ id: instanceId }).data.get().then(({ data: res, error: err }) => {
            if (err) {
                setError('Failed to fetch')
                return
            }
            if (res && 'data' in res) {
                setFilms((res.data as { films: Film[] }).films)
                setError(null)
            }
        })
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, refreshSeconds * 1000)
        return () => clearInterval(interval)
    }, [])

    if (error) return <p className="text-red-400 text-sm">{error}</p>
    if (!films) return <p className="text-gray-400 text-sm">Loading...</p>
    if (films.length === 0) return <p className="text-gray-400 text-sm">No films yet</p>

    return (
        <ul className="flex flex-col gap-2">
            {films.map((f, i) => (
                <li key={f.link ?? i} className="flex gap-2 items-start">
                    {f.poster && (
                        <img
                            src={f.poster}
                            alt={f.film ?? 'Film poster'}
                            className="w-10 h-auto rounded shrink-0"
                        />
                    )}
                    <div className="text-white text-sm min-w-0">
                        <p className="font-medium truncate">
                            {f.film}
                            {f.year && <span className="text-gray-400 font-normal"> ({f.year})</span>}
                        </p>
                        <p className="text-gray-400 text-xs">
                            {f.rating != null ? `★ ${f.rating}` : 'Not rated'}
                            {f.rewatch && ' · rewatch'}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    )
}