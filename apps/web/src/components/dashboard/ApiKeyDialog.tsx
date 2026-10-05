import { type FormEvent, useState } from 'react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Dialog from '../ui/Dialog'
import CatalogLoader from './CatalogLoader'
import ParamForm from './ParamForm'
import { errorMessage, useSetApiKey } from './queries'
import type { CatalogParam, CatalogService, Instance } from './types'
import {
    initialValues,
    type ParamErrors,
    validateParams,
} from './validateParams'

type Props = {
    /** the widget whose service gets the key; null keeps the dialog closed */
    instance: Instance | null
    onClose: () => void
}

export default function ApiKeyDialog({ instance, onClose }: Props) {
    return (
        <Dialog open={instance !== null} onClose={onClose} title="API key">
            {instance && (
                <CatalogLoader>
                    {(services) => (
                        <ApiKeyContent
                            services={services}
                            instance={instance}
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
    onClose: () => void
}

function ApiKeyContent({ services, instance, onClose }: ContentProps) {
    const service = services.find(
        (candidate) => candidate.id === instance.serviceId,
    )

    if (service?.auth.kind !== 'apiKey') {
        return (
            <Alert variant="info">This service doesn't use an API key.</Alert>
        )
    }

    return (
        <ApiKeyForm
            service={service}
            fields={service.auth.fields}
            onClose={onClose}
        />
    )
}

// The stored key is never sent back, so this only tells whether one is set.
function statusMessage(subscription: CatalogService['subscription']) {
    if (!subscription) return 'No key is set yet.'
    if (subscription.status === 'active') {
        return 'A key is already set. Saving a new one replaces it.'
    }
    return 'The saved key was rejected. Enter a new one.'
}

type FormProps = {
    service: CatalogService
    fields: CatalogParam[]
    onClose: () => void
}

function ApiKeyForm({ service, fields, onClose }: FormProps) {
    const setApiKey = useSetApiKey()
    const [values, setValues] = useState(() => initialValues(fields))
    const [errors, setErrors] = useState<ParamErrors>({})
    const [serverError, setServerError] = useState<string | null>(null)

    async function handleSubmit(event: FormEvent) {
        event.preventDefault()
        const result = validateParams(fields, values)
        setErrors(result.ok ? {} : result.errors)
        if (!result.ok) return

        setServerError(null)
        try {
            await setApiKey.mutateAsync({
                serviceId: service.id,
                credentials: result.params,
            })
            onClose()
        } catch (error) {
            setServerError(errorMessage(error))
        }
    }

    return (
        <form onSubmit={handleSubmit} noValidate>
            {serverError && <Alert className="mb-3">{serverError}</Alert>}

            <p className="text-gray-300 text-sm mb-1">
                This key is used by all your {service.name} widgets.
            </p>
            <p className="text-gray-400 text-sm mb-3">
                {statusMessage(service.subscription)}
            </p>

            <ParamForm
                idPrefix="api-key"
                params={fields}
                values={values}
                errors={errors}
                onChange={(name, value) =>
                    setValues((old) => ({ ...old, [name]: value }))
                }
                secret
            />

            <div className="flex justify-end gap-3 mt-4">
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={setApiKey.isPending}>
                    Save
                </Button>
            </div>
        </form>
    )
}
