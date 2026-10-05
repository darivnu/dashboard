import Alert from '../ui/Alert'
import Dialog from '../ui/Dialog'
import { getWidgetEntry } from '../widgetRegistry'
import CatalogLoader from './CatalogLoader'
import InstanceForm, { type InstanceFormValues } from './InstanceForm'
import { layoutChanges, pack, sortByPosition } from './layout'
import { useSaveLayout, useUpdateInstance } from './queries'
import type { CatalogService, Instance } from './types'

type Props = {
    /** the widget being edited; null keeps the dialog closed */
    instance: Instance | null
    onClose: () => void
    /** every widget on the dashboard, to make room when this one changes size */
    instances: Instance[]
}

export default function EditWidgetDialog({
    instance,
    onClose,
    instances,
}: Props) {
    return (
        <Dialog open={instance !== null} onClose={onClose} title="Edit widget">
            {instance && (
                <CatalogLoader>
                    {(services) => (
                        <EditWidgetContent
                            services={services}
                            instance={instance}
                            instances={instances}
                            onClose={onClose}
                        />
                    )}
                </CatalogLoader>
            )}
        </Dialog>
    )
}

type ContentProps = {
    services: CatalogService[]
    instance: Instance
    instances: Instance[]
    onClose: () => void
}

function EditWidgetContent({
    services,
    instance,
    instances,
    onClose,
}: ContentProps) {
    const update = useUpdateInstance()
    const saveLayout = useSaveLayout()

    const widget = services
        .find((service) => service.id === instance.serviceId)
        ?.widgets.find((candidate) => candidate.id === instance.widgetId)

    if (!widget) {
        return (
            <Alert variant="info">
                This widget is no longer available, so its settings can't be
                edited.
            </Alert>
        )
    }

    const entry = getWidgetEntry(instance.serviceId, instance.widgetId)

    async function handleSubmit(values: InstanceFormValues) {
        await update.mutateAsync({ id: instance.id, body: values })

        // A new size can push the cards after this one to other places.
        const resized = instances.map((other) =>
            other.id === instance.id
                ? { ...other, w: values.w, h: values.h }
                : other,
        )
        const changes = layoutChanges(resized, pack(sortByPosition(resized)))
        if (changes.length > 0) await saveLayout.mutateAsync(changes)

        onClose()
    }

    return (
        <InstanceForm
            idPrefix="edit"
            widget={widget}
            minSize={entry.minSize}
            initial={{
                title: instance.title,
                params: instance.params,
                refreshSeconds: instance.refreshSeconds,
                w: instance.w,
                h: instance.h,
            }}
            submitLabel="Save"
            onSubmit={handleSubmit}
            onCancel={onClose}
        />
    )
}
