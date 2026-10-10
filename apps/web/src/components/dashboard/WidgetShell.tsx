import { type ComponentType, type ReactNode, useMemo } from 'react'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import {
    getWidgetEntry,
    type WidgetDefinition,
    type WidgetProps,
} from '../widgetRegistry'
import ConnectButton from './ConnectButton'
import { useCatalogService } from './queries'
import type { Instance, WidgetErrorCode } from './types'
import { useWidgetData, type WidgetError } from './useWidgetData'
import WidgetErrorBoundary from './WidgetErrorBoundary'

type Props = {
    instance: Instance
    onEdit: () => void
    onDelete: () => void
    onMove: (direction: 'earlier' | 'later') => void
    onSetApiKey: () => void
}

const NOT_RESPONDING = "The service isn't responding right now."

// One message per code the API can answer with. Typed by WidgetErrorCode, so
// a code added to the API stops this compiling until it has a message.
const serviceMessages: Record<WidgetErrorCode, string> = {
    rate_limited:
        'Too many requests to this service. It will retry automatically.',
    upstream_error: NOT_RESPONDING,
    invalid_config: "This widget's settings are no longer valid.",
    needs_reauth: 'This service needs to be reconnected.',
}

function messageFor(error: WidgetError) {
    if (error.kind === 'network') return "Couldn't reach the dashboard server."
    return serviceMessages[error.code]
}

function isInvalidConfig(error: WidgetError | null) {
    return error?.kind === 'service' && error.code === 'invalid_config'
}

function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function WidgetShell(props: Props) {
    const { serviceId, widgetId } = props.instance
    const entry = getWidgetEntry(serviceId, widgetId)
    if ('legacy' in entry) {
        return <LegacyShell {...props} Legacy={entry.legacy} />
    }
    return <DataShell {...props} entry={entry} />
}

// A legacy widget fetches for itself, so it only gets the frame.
function LegacyShell({
    Legacy,
    ...props
}: Props & { Legacy: ComponentType<WidgetProps> }) {
    const { instance } = props
    return (
        <Frame {...props}>
            <WidgetErrorBoundary>
                <Legacy
                    instanceId={instance.id}
                    params={instance.params}
                    refreshSeconds={instance.refreshSeconds}
                />
            </WidgetErrorBoundary>
        </Frame>
    )
}

function DataShell({
    entry,
    ...props
}: Props & { entry: WidgetDefinition<unknown> }) {
    const { instance, onEdit, onSetApiKey } = props
    const { data, fetchedAt, error, isLoading, isRefreshing, refresh } =
        useWidgetData(instance)
    const service = useCatalogService(instance.serviceId)

    // Parsed once per fetch, not on every render: the widget gets the same
    // object until new data arrives.
    const parsed = useMemo(() => {
        if (data === undefined) return null
        try {
            return { ok: true as const, value: entry.parse(data) }
        } catch {
            return { ok: false as const }
        }
    }, [data, entry])

    const retry = (
        <Button variant="secondary" onClick={refresh}>
            Try again
        </Button>
    )

    let body: ReactNode
    let refreshFailed: string | null = null

    if (isInvalidConfig(error)) {
        // The stored settings can't produce data any more, so there is
        // nothing valid to keep on screen.
        body = (
            <Alert
                action={
                    <Button variant="secondary" onClick={onEdit}>
                        Edit settings
                    </Button>
                }
            >
                {serviceMessages.invalid_config}
            </Alert>
        )
    } else if (isLoading) {
        body = (
            <div className="h-full flex items-center justify-center">
                <Spinner />
            </div>
        )
    } else if (parsed === null) {
        // First load failed: there is no data to show.
        const needsReauth =
            error?.kind === 'service' && error.code === 'needs_reauth'
        let message = error ? messageFor(error) : NOT_RESPONDING
        let action: ReactNode = retry
        // Retrying can't help without credentials, so offer to give them
        // instead: connect the account for oauth2, set the key otherwise.
        if (needsReauth && service?.auth.kind === 'oauth2') {
            const subscribed = service.subscription !== null
            if (!subscribed) {
                message = 'Connect your account to use this widget.'
            }
            action = (
                <ConnectButton
                    serviceId={instance.serviceId}
                    available={service.auth.available}
                    label={subscribed ? 'Reconnect' : 'Connect'}
                    variant="secondary"
                />
            )
        } else if (needsReauth) {
            action = (
                <Button variant="secondary" onClick={onSetApiKey}>
                    Set API key
                </Button>
            )
        }
        body = <Alert action={action}>{message}</Alert>
    } else if (!parsed.ok) {
        body = <Alert action={retry}>{NOT_RESPONDING}</Alert>
    } else {
        const Widget = entry.component
        body = (
            <WidgetErrorBoundary onReload={refresh} resetKey={parsed.value}>
                <Widget
                    instance={instance}
                    params={instance.params}
                    data={parsed.value}
                />
            </WidgetErrorBoundary>
        )
        // A refresh failed but the last good data is still on screen.
        if (error) refreshFailed = messageFor(error)
    }

    const status = (
        <>
            {isRefreshing && <Spinner label="Refreshing" className="h-3 w-3" />}
            {refreshFailed && (
                <span className="text-warning-fg text-xs" title={refreshFailed}>
                    Refresh failed
                    <span className="sr-only">: {refreshFailed}</span>
                </span>
            )}
            {fetchedAt && (
                <time
                    dateTime={fetchedAt.toISOString()}
                    className="text-muted text-xs"
                >
                    {formatTime(fetchedAt)}
                </time>
            )}
        </>
    )

    return (
        <Frame {...props} status={status} onRefresh={refresh}>
            {body}
        </Frame>
    )
}

const moveButton = 'md:sr-only md:focus-visible:not-sr-only'

type FrameProps = Props & {
    status?: ReactNode
    onRefresh?: () => void
    children: ReactNode
}

function Frame({
    instance,
    status,
    onRefresh,
    onEdit,
    onDelete,
    onMove,
    onSetApiKey,
    children,
}: FrameProps) {
    // Every card shares the one cached catalog request.
    const service = useCatalogService(instance.serviceId)
    const auth = service?.auth
    const title =
        instance.title ?? `${instance.serviceId} / ${instance.widgetId}`
    return (
        <article
            aria-label={title}
            className="bg-surface rounded-xl p-4 flex flex-col gap-2 h-full min-h-0"
        >
            {/* From md up the grid drags the card by this header. */}
            <header className="widget-drag-handle md:cursor-grab flex flex-wrap justify-between items-center gap-2">
                <h3 className="text-fg font-semibold truncate">{title}</h3>
                <div className="flex items-center gap-2">
                    {status}
                    {onRefresh && (
                        <Button variant="ghost" onClick={onRefresh}>
                            Refresh
                        </Button>
                    )}
                    {auth?.kind === 'apiKey' && (
                        <Button variant="ghost" onClick={onSetApiKey}>
                            API key
                        </Button>
                    )}
                    {auth?.kind === 'oauth2' && (
                        <ConnectButton
                            serviceId={instance.serviceId}
                            available={auth.available}
                            label={
                                service?.subscription ? 'Reconnect' : 'Connect'
                            }
                        />
                    )}
                    <Button variant="ghost" onClick={onEdit}>
                        Edit
                    </Button>
                    {/* The only way to reorder on a phone. From md up the
                        card is dragged instead, so these stay hidden until
                        a keyboard user tabs to them. */}
                    <Button
                        variant="ghost"
                        aria-label="Move earlier"
                        className={moveButton}
                        onClick={() => onMove('earlier')}
                    >
                        ↑
                    </Button>
                    <Button
                        variant="ghost"
                        aria-label="Move later"
                        className={moveButton}
                        onClick={() => onMove('later')}
                    >
                        ↓
                    </Button>
                    <Button variant="dangerGhost" onClick={onDelete}>
                        Delete
                    </Button>
                </div>
            </header>
            <div className="flex-1 min-h-0 overflow-auto">{children}</div>
        </article>
    )
}
