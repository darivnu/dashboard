import { useState } from 'react'
import Button from '../ui/Button'
import Dialog from '../ui/Dialog'
import { getWidgetEntry } from '../widgetRegistry'
import CatalogLoader from './CatalogLoader'
import InstanceForm, { type InstanceFormValues } from './InstanceForm'
import { nextSlot } from './layout'
import { useCreateInstance } from './queries'
import type { CatalogService, CatalogWidget, Instance } from './types'

type Props = {
    open: boolean
    onClose: () => void
    /** the widgets already on the dashboard, to find a free place for the new one */
    instances: Instance[]
}

type Selection = { service: CatalogService; widget: CatalogWidget }

export default function AddWidgetDialog({ open, onClose, instances }: Props) {
    return (
        <Dialog open={open} onClose={onClose} title="Add widget">
            <CatalogLoader>
                {(services) => (
                    <AddWidgetContent
                        services={services}
                        instances={instances}
                        onClose={onClose}
                    />
                )}
            </CatalogLoader>
        </Dialog>
    )
}

type ContentProps = Omit<Props, 'open'> & { services: CatalogService[] }

// Rendered only while the dialog is open, so its state (the selected widget)
// starts fresh every time.
function AddWidgetContent({ services, instances, onClose }: ContentProps) {
    const create = useCreateInstance()
    const [selected, setSelected] = useState<Selection | null>(null)

    if (!selected) {
        return (
            <>
                {services.map((service) => (
                    <section key={service.id} className="mb-4">
                        <h3 className="text-gray-300 font-semibold mb-2">
                            {service.name}
                        </h3>
                        {service.widgets.map((widget) => (
                            <button
                                key={widget.id}
                                type="button"
                                onClick={() => setSelected({ service, widget })}
                                className="w-full text-left p-3 mb-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition"
                            >
                                <span className="block font-semibold">
                                    {widget.name}
                                </span>
                                <span className="block text-gray-400 text-sm">
                                    {widget.description}
                                </span>
                            </button>
                        ))}
                    </section>
                ))}
            </>
        )
    }

    const { service, widget } = selected
    const entry = getWidgetEntry(service.id, widget.id)

    async function handleSubmit(values: InstanceFormValues) {
        const { x, y } = nextSlot(instances, values)
        await create.mutateAsync({
            serviceId: service.id,
            widgetId: widget.id,
            ...values,
            x,
            y,
        })
        onClose()
    }

    return (
        <>
            <div className="flex items-center gap-2 mb-4">
                <Button variant="ghost" onClick={() => setSelected(null)}>
                    ← Back
                </Button>
                <h3 className="font-semibold">{widget.name}</h3>
            </div>
            <InstanceForm
                idPrefix="add"
                widget={widget}
                minSize={entry.minSize}
                initial={{
                    title: null,
                    params: {},
                    refreshSeconds: widget.refresh.default,
                    ...entry.defaultSize,
                }}
                submitLabel="Add"
                onSubmit={handleSubmit}
                onCancel={onClose}
            />
        </>
    )
}
