/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** OAuthNotice
 */

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import { queryKeys, useCatalog } from './queries'

// One message per ?oauth_error= code the API redirects with
// (OAuthErrorCode in apps/api/src/modules/subscriptions/subscriptions.service.ts).
const errorMessages: Record<string, string> = {
    unauthorized:
        'Your session ended before the connection finished. Log in and try again.',
    unknown_service: "This service doesn't exist anymore.",
    not_oauth: "This service doesn't connect through an account.",
    not_configured: "Connecting this service isn't set up on the server yet.",
    invalid_state: "The connection couldn't be verified. Please try again.",
    expired: 'The connection took too long. Please try again.',
    denied: 'The connection was cancelled.',
    provider_error: 'The service reported an error. Please try again.',
    session_mismatch:
        'You were logged in as someone else when the connection finished. Please try again.',
    exchange_failed:
        "The service didn't accept the connection. Please try again.",
}
const FALLBACK = 'The connection failed. Please try again.'

type Notice =
    | { kind: 'connected'; serviceId: string }
    | { kind: 'error'; code: string }

// The API sends the browser back to /dashboard?connected=<service> or
// ?oauth_error=<code> at the end of an OAuth flow. This shows the outcome,
// refreshes what depends on it, and removes the param from the URL so a
// reload doesn't show the message again.
export default function OAuthNotice() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [notice, setNotice] = useState<Notice | null>(null)
    const client = useQueryClient()
    const catalog = useCatalog()

    useEffect(() => {
        const connected = searchParams.get('connected')
        const error = searchParams.get('oauth_error')
        if (!connected && !error) {
            return
        }
        setNotice(
            connected
                ? { kind: 'connected', serviceId: connected }
                : { kind: 'error', code: error ?? '' },
        )
        // The subscription status and the widgets' data both changed.
        client.invalidateQueries({ queryKey: queryKeys.catalog })
        client.invalidateQueries({ queryKey: queryKeys.allWidgetData })
        setSearchParams({}, { replace: true })
    }, [searchParams, setSearchParams, client])

    if (!notice) {
        return null
    }

    const dismiss = (
        <Button variant="ghost" onClick={() => setNotice(null)}>
            Dismiss
        </Button>
    )

    if (notice.kind === 'connected') {
        const name =
            catalog.data?.find((service) => service.id === notice.serviceId)
                ?.name ?? notice.serviceId
        return (
            <Alert variant="success" action={dismiss} className="mb-4">
                {name} is connected.
            </Alert>
        )
    }
    return (
        <Alert action={dismiss} className="mb-4">
            {errorMessages[notice.code] ?? FALLBACK}
        </Alert>
    )
}
