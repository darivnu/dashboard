/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** tokens
*/

import type {
    ServiceSubscriptionInstance,
    ServiceSubscriptionRepo,
} from '../../modules/subscriptions/subscriptions.repo'
import { WidgetFetchError } from '../types'
import type { OAuthCredentials } from '../types'
import { describeOAuthError, isPermanentOAuthError } from './errors'
import type { OAuthProviderId } from './ids'
import type { OAuthProvider } from './providers'

//refresh a bit before the real expiry, so a token can't die between here and the provider's API
const REFRESH_MARGIN_MS = 60_000

export interface TokenManagerDeps {
    repo: Pick<ServiceSubscriptionRepo, 'updateCredentialsLocked'>
    getProvider: (id: OAuthProviderId) => OAuthProvider | null
    /** Injectable so tests can move the clock. */
    now?: () => Date
}

//the credentials column is plain JSON to the database; check it really holds what we stored
function readCredentials(value: unknown): OAuthCredentials | null {
    const creds = value as Partial<OAuthCredentials> | null
    if (!creds || typeof creds.accessToken !== 'string' || creds.accessToken === '') return null
    return {
        accessToken: creds.accessToken,
        refreshToken: typeof creds.refreshToken === 'string' ? creds.refreshToken : null,
        expiresAt: typeof creds.expiresAt === 'string' ? creds.expiresAt : null,
        scopes: Array.isArray(creds.scopes) ? creds.scopes : [],
    }
}

/**
 * Hands widgets a valid access token, refreshing it when it is about to expire.
 *
 * A refresh must happen once, even when several widgets of the same user ask
 * at the same moment: many providers rotate the refresh token, so a second
 * refresh with the old one would fail and wrongly flag the subscription as
 * needs_reauth. Two guards for that:
 * - inside one server instance, callers share the same in-flight promise;
 * - across instances (Vercel may run several), the row is locked in the
 *   database and the expiry is checked again once we hold the lock.
 */
export function createTokenManager(deps: TokenManagerDeps) {
    const { repo, getProvider } = deps
    const now = deps.now ?? (() => new Date())
    const inFlight = new Map<string, Promise<string>>()

    //null expiresAt = the token never expires (GitHub OAuth Apps), so it never needs a refresh
    function isExpiring(creds: OAuthCredentials): boolean {
        if (creds.expiresAt === null)
            return false
        return Date.parse(creds.expiresAt) - now().getTime() <= REFRESH_MARGIN_MS
    }

    async function refresh(subscription: ServiceSubscriptionInstance, providerId: OAuthProviderId): Promise<string> {
        const label = `${subscription.serviceId} subscription`
        try {
            const row = await repo.updateCredentialsLocked(subscription.id, async (locked) => {
                const current = readCredentials(locked.credentials)
                if (!current)
                    throw new WidgetFetchError('needs_reauth', `Stored ${label} credentials are unreadable`)

                //another request (maybe on another instance) refreshed while we waited for the lock
                if (!isExpiring(current))
                    return null

                const provider = getProvider(providerId)
                if (!provider) {
                    console.error(`Cannot refresh the ${label}: OAuth provider "${providerId}" is not configured`)
                    throw new WidgetFetchError('upstream_error', `OAuth provider ${providerId} is not configured`)
                }
                if (!current.refreshToken || !provider.refresh) {
                    throw new WidgetFetchError('needs_reauth', `The ${label} token expired and cannot be refreshed`)
                }

                const fresh = await provider.refresh(current.refreshToken)
                //some providers only send a new refresh token when they rotate it: keep the old one otherwise
                return { ...fresh, refreshToken: fresh.refreshToken ?? current.refreshToken }
            })

            const creds = row ? readCredentials(row.credentials) : null
            if (!creds)
                throw new WidgetFetchError('needs_reauth', `The ${label} no longer exists`)
            return creds.accessToken
        } catch (error) {
            if (error instanceof WidgetFetchError)
                throw error
            if (isPermanentOAuthError(error)) {
                throw new WidgetFetchError('needs_reauth', `The provider rejected the ${label} refresh token`)
            }
            //never pass the error itself on (as cause or to the logs): it may carry the provider's response
            console.error(`Refreshing the ${label} failed: ${describeOAuthError(error)}`)
            throw new WidgetFetchError('upstream_error', `Refreshing the ${label} failed`)
        }
    }

    return {
        async getAccessToken(subscription: ServiceSubscriptionInstance, providerId: OAuthProviderId): Promise<string> {
            const creds = readCredentials(subscription.credentials)
            if (!creds)
                throw new WidgetFetchError('needs_reauth', `Stored ${subscription.serviceId} credentials are unreadable`)
            if (!isExpiring(creds))
                return creds.accessToken

            //someone in this instance is already refreshing this subscription: wait for their result
            const pending = inFlight.get(subscription.id)
            if (pending)
                return pending

            const promise = refresh(subscription, providerId).finally(() => {
                inFlight.delete(subscription.id)
            })
            inFlight.set(subscription.id, promise)
            return promise
        },
    }
}

export type TokenManager = ReturnType<typeof createTokenManager>
