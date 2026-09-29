type WidgetInstance = {
    id: string
    serviceId: string
    widgetId: string
    title: string | null
    params: Record<string, string | number>
    refreshSeconds: number
}

type Props = {
    widgets: WidgetInstance[]
    onDelete: (id: string) => void
}

export default function WidgetGrid({ widgets, onDelete }: Props) {
    if (widgets.length === 0) {
    return <p className="text-gray-400 text-center text-lg mt-12">No widgets yet — click "Add Widget" to start.</p>
    }

    return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map((w) => (
        <div key={w.id} className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center">
            <h3 className="text-white font-semibold">{w.title ?? `${w.serviceId} / ${w.widgetId}`}</h3>
            <button
                onClick={() => onDelete(w.id)}
                className="text-red-400 hover:text-red-300 text-sm"
            >
                Delete
            </button>
            </div>
            <p className="text-gray-400 text-sm">Params: {JSON.stringify(w.params)}</p>
            <p className="text-gray-500 text-xs">Refresh: {w.refreshSeconds}s</p>
        </div>
        ))}
    </div>
    )
}