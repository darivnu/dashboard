import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import ApiKeyDialog from '../components/dashboard/ApiKeyDialog'
import CatalogLoader from '../components/dashboard/CatalogLoader'
import ConfirmDialog from '../components/dashboard/ConfirmDialog'
import ConnectButton from '../components/dashboard/ConnectButton'
import {
    errorMessage,
    useDisconnectService,
    useInstances,
} from '../components/dashboard/queries'
import type { CatalogService } from '../components/dashboard/types'
import AppShell from '../components/layout/AppShell'
import Button from '../components/ui/Button'

export default function Profile() {
    const { user } = useAuth()

    return (
        <AppShell>
            <div className="mx-auto max-w-3xl">
                <h1 className="mb-6 text-2xl font-bold text-fg">Profile</h1>

                <section aria-labelledby="profile-account" className="mb-8">
                    <h2
                        id="profile-account"
                        className="mb-3 text-lg font-semibold text-fg"
                    >
                        Account
                    </h2>
                    {user && (
                        <div className="rounded-xl bg-surface p-4">
                            <p className="break-all text-fg">{user.email}</p>
                            <p className="text-sm text-muted">
                                Member since{' '}
                                {new Date(user.createdAt).toLocaleDateString(
                                    DATE_LOCALE,
                                )}
                            </p>
                        </div>
                    )}
                </section>

                <section aria-labelledby="profile-services">
                    <h2
                        id="profile-services"
                        className="mb-3 text-lg font-semibold text-fg"
                    >
                        Services
                    </h2>
                    <CatalogLoader>
                        {(services) => <ServiceList services={services} />}
                    </CatalogLoader>
                </section>
            </div>
        </AppShell>
    )
}

// Day/month/year, whatever the language of the browser.
const DATE_LOCALE = 'en-GB'

/** A service the user has to give something to: a key, or access to an account. */
type CredentialService = CatalogService & {
    auth: { kind: 'apiKey' | 'oauth2' }
}

function needsCredentials(
    service: CatalogService,
): service is CredentialService {
    return service.auth.kind === 'apiKey' || service.auth.kind === 'oauth2'
}

function ServiceList({ services }: { services: CatalogService[] }) {
    // Ids, not the services themselves: the dialogs always get the current
    // version from the catalog.
    const [apiKeyId, setApiKeyId] = useState<string | null>(null)
    const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
    const instances = useInstances()
    const disconnect = useDisconnectService()
    const list = useRef<HTMLUListElement>(null)
    const [disconnectedId, setDisconnectedId] = useState<string | null>(null)

    // The button that opened the confirmation is gone once its service is
    // disconnected, and the focus with it. Put it on what replaced it.
    useEffect(() => {
        if (disconnectedId === null) return
        list.current
            ?.querySelector<HTMLElement>(
                `[data-service="${CSS.escape(disconnectedId)}"] button:enabled`,
            )
            ?.focus()
        setDisconnectedId(null)
    }, [disconnectedId])

    const listed = services.filter(needsCredentials)
    const disconnecting =
        listed.find((service) => service.id === disconnectingId) ?? null
    // Still loading or failed counts as none: the question is asked without
    // the number rather than not at all.
    const widgetCount = (instances.data ?? []).filter(
        (instance) => instance.serviceId === disconnectingId,
    ).length

    const handleDisconnect = () => {
        if (!disconnecting) return
        disconnect.mutate(disconnecting.id, {
            onSuccess: (serviceId) => {
                setDisconnectingId(null)
                setDisconnectedId(serviceId)
            },
        })
    }

    const cancelDisconnect = () => {
        setDisconnectingId(null)
        disconnect.reset()
    }

    if (listed.length === 0) {
        return (
            <p className="text-muted">No service needs an account or a key.</p>
        )
    }

    return (
        <>
            <ul
                ref={list}
                className="divide-y divide-field-border rounded-xl bg-surface px-4"
            >
                {listed.map((service) => (
                    <ServiceRow
                        key={service.id}
                        service={service}
                        onSetApiKey={() => setApiKeyId(service.id)}
                        onDisconnect={() => setDisconnectingId(service.id)}
                    />
                ))}
            </ul>

            <ApiKeyDialog
                serviceId={apiKeyId}
                onClose={() => setApiKeyId(null)}
            />
            <ConfirmDialog
                open={disconnecting !== null}
                title={disconnecting ? disconnectTitle(disconnecting) : ''}
                message={
                    disconnecting
                        ? disconnectMessage(disconnecting, widgetCount)
                        : ''
                }
                confirmLabel={
                    disconnecting?.auth.kind === 'apiKey'
                        ? 'Remove key'
                        : 'Disconnect'
                }
                busy={disconnect.isPending}
                error={
                    disconnect.isError ? errorMessage(disconnect.error) : null
                }
                onConfirm={handleDisconnect}
                onCancel={cancelDisconnect}
            />
        </>
    )
}

// A subscription that is not active was refused by the service: the key or
// the token has to be given again.
function statusLabel({ auth, subscription }: CredentialService) {
    if (auth.kind === 'apiKey') {
        if (!subscription) return 'No key'
        return subscription.status === 'active' ? 'Key set' : 'Key rejected'
    }
    if (!subscription) return 'Not connected'
    return subscription.status === 'active' ? 'Connected' : 'Needs reconnecting'
}

function disconnectTitle({ auth, name }: CredentialService) {
    return auth.kind === 'apiKey' ? `Remove ${name} key` : `Disconnect ${name}`
}

function disconnectMessage(
    { auth, name }: CredentialService,
    widgetCount: number,
) {
    const isKey = auth.kind === 'apiKey'
    if (widgetCount === 0) {
        return isKey
            ? `The ${name} key will be removed. You can set a new one at any time.`
            : `${name} will be disconnected. You can connect it again at any time.`
    }
    const one = widgetCount === 1
    const until = isKey ? 'set a new key' : 'reconnect'
    return (
        `Your ${widgetCount} ${name} ${one ? 'widget' : 'widgets'} will stop updating until you ${until}. ` +
        (one
            ? 'The widget itself is kept.'
            : 'The widgets themselves are kept.')
    )
}

type RowProps = {
    service: CredentialService
    onSetApiKey: () => void
    onDisconnect: () => void
}

function ServiceRow({ service, onSetApiKey, onDisconnect }: RowProps) {
    const { auth, name, subscription } = service
    const subscribed = subscription !== null
    const refused = subscribed && subscription.status !== 'active'

    return (
        <li
            data-service={service.id}
            className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
            <div className="min-w-0">
                <h3 className="break-words font-semibold text-fg">{name}</h3>
                <p
                    className={`text-sm ${refused ? 'text-warning-fg' : 'text-muted'}`}
                >
                    {statusLabel(service)}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {auth.kind === 'apiKey' ? (
                    <Button
                        variant="secondary"
                        aria-label={`${subscribed ? 'Replace key' : 'Set key'} for ${name}`}
                        onClick={onSetApiKey}
                    >
                        {subscribed ? 'Replace key' : 'Set key'}
                    </Button>
                ) : (
                    <ConnectButton
                        serviceId={service.id}
                        available={auth.available}
                        label={subscribed ? 'Reconnect' : 'Connect'}
                        variant="secondary"
                        ariaLabel={`${subscribed ? 'Reconnect' : 'Connect'} ${name}`}
                    />
                )}
                {subscribed && (
                    <Button
                        variant="dangerGhost"
                        className="px-4 py-2"
                        aria-label={
                            auth.kind === 'apiKey'
                                ? `Remove key for ${name}`
                                : `Disconnect ${name}`
                        }
                        onClick={onDisconnect}
                    >
                        {auth.kind === 'apiKey' ? 'Remove key' : 'Disconnect'}
                    </Button>
                )}
            </div>
        </li>
    )
}
