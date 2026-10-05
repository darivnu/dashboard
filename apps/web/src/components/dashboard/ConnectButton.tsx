/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** ConnectButton
 */

import { connectUrl } from '../../api'
import Button from '../ui/Button'

type Props = {
    serviceId: string
    /** false when the server has no credentials for the provider */
    available: boolean
    label: 'Connect' | 'Reconnect'
    variant?: 'ghost' | 'secondary'
}

const UNAVAILABLE = "Connecting this service isn't set up on the server yet."

// Sends the whole page to the API, which redirects to the provider's consent
// page. The user comes back to /dashboard afterwards (see OAuthNotice).
export default function ConnectButton({
    serviceId,
    available,
    label,
    variant = 'ghost',
}: Props) {
    const button = (
        <Button
            variant={variant}
            disabled={!available}
            onClick={() => window.location.assign(connectUrl(serviceId))}
        >
            {label}
        </Button>
    )
    if (available) {
        return button
    }
    // A disabled button gets no hover events in some browsers, so the
    // explanation goes on a wrapper.
    return <span title={UNAVAILABLE}>{button}</span>
}
