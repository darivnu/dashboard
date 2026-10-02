import { useState, useEffect } from 'react'
import { api } from '../api'

type Param = {
    name: string
    label: string
    type: 'string' | 'integer'
    required: boolean
    default?: string | number
}

type Widget = {
    id: string
    name: string
    description: string
    params: Param[]
    refresh: { default: number; min: number }
}

type Service = {
    id: string
    name: string
    widgets: Widget[]
}

type Props = {
    open: boolean
    onClose: () => void
    onCreated: () => void
}

export default function AddWidgetModal({ open, onClose, onCreated }: Props) {
    const [services, setServices] = useState<Service[]>([])
    const [selected, setSelected] = useState<{ service: Service; widget: Widget } | null>(null)
    const [params, setParams] = useState<Record<string, string>>({})
    const [refreshSeconds, setRefreshSeconds] = useState<number>(60)

    useEffect(() => {
        if (!open) return
        console.log('Modal opened, fetching catalog...')
        api.catalog.get().then(({ data, error }) => {
            console.log('Catalog response:', { data, error })
            if (error) {
                console.error(error)
                return
            }
            setServices(data?.services ?? [])
        })
    }, [open])

    const handleSelect = (service: Service, widget: Widget) => {
    setSelected({ service, widget })
    setRefreshSeconds(widget.refresh.default)
    const defaults: Record<string, string> = {}
    widget.params.forEach(p => {
        if (p.default !== undefined) defaults[p.name] = String(p.default)
    })
    setParams(defaults)
    }

    const handleSubmit = async () => {
    if (!selected) return

    const parsed: Record<string, string | number> = {}
    selected.widget.params.forEach(p => {
        const val = params[p.name]
        if (val !== undefined && val !== '') {
        parsed[p.name] = p.type === 'integer' ? Number(val) : val
        }
    })

        console.log('Sending:', {
        serviceId: selected.service.id,
        widgetId: selected.widget.id,
        params: parsed,
        refreshSeconds,
    })

    console.log('Sending params:', JSON.stringify(parsed))

    const res = await fetch('/api/dashboard/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            serviceId: selected.service.id,
            widgetId: selected.widget.id,
            params: parsed,
            refreshSeconds,
        })
    })
    const resData = await res.json()
    console.log('Response:', resData)

    if (!res.ok) {
        alert('Failed: ' + JSON.stringify(resData))
        return
    }

    setSelected(null)
    setParams({})
    onCreated()
    onClose()
    }

    if (!open) return null

    return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {!selected ? (
            <>
            <h2 className="text-xl font-bold text-white mb-4">Add Widget</h2>
            {services.map(s => (
                <div key={s.id} className="mb-4">
                <h3 className="text-white font-semibold mb-2">{s.name}</h3>
                {s.widgets.map(w => (
                    <button
                    key={w.id}
                    onClick={() => handleSelect(s, w)}
                    className="w-full text-left p-3 mb-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition"
                    >
                    <p className="text-white font-medium">{w.name}</p>
                    <p className="text-gray-400 text-sm">{w.description}</p>
                    </button>
                ))}
                </div>
            ))}
            <button onClick={onClose} className="mt-4 text-gray-400 hover:text-white text-sm">Cancel</button>
            </>
        ) : (
            <>
            <h2 className="text-xl font-bold text-white mb-4">Configure: {selected.widget.name}</h2>

            {selected.widget.params.map(p => (
                <div key={p.name} className="mb-3">
                <label className="text-gray-300 text-sm block mb-1">
                    {p.label} {p.required && <span className="text-red-400">*</span>}
                </label>
                <input
                    type={p.type === 'integer' ? 'number' : 'text'}
                    value={params[p.name] ?? ''}
                    onChange={e => setParams({ ...params, [p.name]: e.target.value })}
                    className="w-full p-2 rounded-lg bg-gray-700 text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
                </div>
            ))}

            <div className="mb-3">
                    <label className="text-gray-300 text-sm block mb-1">
                Refresh interval (seconds, min: {selected.widget.refresh.min})
                </label>
                <input
                type="number"
                value={refreshSeconds}
                min={selected.widget.refresh.min}
                onChange={e => setRefreshSeconds(Number(e.target.value))}
                className="w-full p-2 rounded-lg bg-gray-700 text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div className="flex gap-3 mt-4">
                <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-500 transition">
                Back
                </button>
                <button onClick={handleSubmit} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition">
                Add to dashboard
                </button>
            </div>
            </>
        )}

        </div>
    </div>
    )
}