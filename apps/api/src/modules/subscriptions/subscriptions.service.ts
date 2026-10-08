/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** These are the rules for the subscriptions repo, which is responsible for managing subscriptions in the database.
*/

import { generateCodeVerifier, generateState } from 'arctic'
import { decrypt, encrypt } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import { describeOAuthError } from '../../services/oauth/errors'
import { isOAuthProviderId } from '../../services/oauth/ids'
import type { OAuthProviderId } from '../../services/oauth/ids'
import type { OAuthProvider } from '../../services/oauth/providers'
import { readCredentials } from '../../services/oauth/tokens'
import { validateParams } from '../../services/params'
import { registry } from '../../services/registry'
import { WidgetFetchError } from '../../services/types'
import type { ServiceDef } from '../../services/types'
import type { ServiceSubscriptionInstance, ServiceSubscriptionRepo } from './subscriptions.repo'

// How long a user has between clicking Connect and coming back from the provider.
// The cookie also expires after that, but cookie expiry is up to the browser, so we check it ourselves too.
const OAUTH_FLOW_MAX_AGE_MS = 10 * 60 * 1000

/**
 * Why an OAuth flow failed. The routes send the user back to the dashboard
 * with `?oauth_error=<code>`, and the frontend shows a message for each one.
 */
export type OAuthErrorCode =
    | 'unauthorized' //not logged in
    | 'unknown_service'
    | 'not_oauth' //the service uses an API key (or nothing)
    | 'not_configured' //the provider's env variables are not set
    | 'invalid_state' //no / broken / mismatched pending cookie: maybe a forged link
    | 'expired' //more than 10 minutes on the provider's page
    | 'denied' //the user clicked "Cancel" on the provider's page
    | 'provider_error' //the provider sent back another error
    | 'session_mismatch' //logged in as someone else than who started the flow
    | 'exchange_failed' //trading the code for a token failed
    // only when logging in with a provider (auth.service.ts loginWithProvider)
    | 'no_verified_email' //the provider's primary email is missing or not verified
    | 'email_unverified' //a local account with that email exists but was never verified
    | 'identity_taken' //logged in, but this provider account is linked to another user
    | 'account_disabled'

export class OAuthFlowError extends Error {
    constructor(public readonly code: OAuthErrorCode) {
        super(`OAuth flow failed: ${code}`)
        this.name = 'OAuthFlowError'
    }
}

// What the oauth_pending cookie holds (encrypted) between /authorize and /callback.
// `state` is the random value the provider must send back: it proves the callback answers OUR request.
interface PendingOAuth {
    state: string
    codeVerifier: string | null
    serviceId: string
    userId: string
    createdAt: number
}

//the cookie comes from the browser: decrypt() fails on anything we didn't encrypt, and the shape is checked anyway
function readPending(value: string | undefined): PendingOAuth | null {
    if (!value)
        return null
    try {
        const pending = JSON.parse(decrypt(value)) as Partial<PendingOAuth> //partial means we check the shape below, not here
        if (typeof pending.state !== 'string' || typeof pending.serviceId !== 'string'
            || typeof pending.userId !== 'string' || typeof pending.createdAt !== 'number')
            return null
        return {
            state: pending.state,
            codeVerifier: typeof pending.codeVerifier === 'string' ? pending.codeVerifier : null,
            serviceId: pending.serviceId,
            userId: pending.userId,
            createdAt: pending.createdAt,
        }
    } catch {
        return null
    }
}

export interface OAuthCallbackInput {
    /** Raw value of the oauth_pending cookie, if the browser sent one. */
    pending: string | undefined
    /** The `:provider` part of the callback URL. */
    providerId: string
    query: { code?: string; state?: string; error?: string }
    /** The logged-in user, or null without a valid session. */
    userId: string | null
}

export function createSubscriptionsService(
    repo: ServiceSubscriptionRepo,
    getProvider: (id: OAuthProviderId) => OAuthProvider | null,
    now: () => Date = () => new Date(),
) {
    //finds an oauth2 service and its configured provider, or says why it can't
    function oauthServiceOrThrow(serviceId: string): { service: ServiceDef; provider: OAuthProvider; scopes: string[] } {
        const service = registry.getService(serviceId)
        if (!service)
            throw new OAuthFlowError('unknown_service')
        if (service.auth.kind !== 'oauth2')
            throw new OAuthFlowError('not_oauth')
        const provider = getProvider(service.auth.provider)
        if (!provider)
            throw new OAuthFlowError('not_configured')
        return { service, provider, scopes: service.auth.scopes }
    }

    //the user is gone anyway; if the provider can't be reached, the token just stays valid at the provider
    async function revokeQuietly(service: ServiceDef, credentials: unknown): Promise<void> {
        if (service.auth.kind !== 'oauth2')
            return
        const provider = getProvider(service.auth.provider)
        const creds = readCredentials(credentials)
        if (!provider?.revoke || !creds)
            return
        try {
            await provider.revoke(creds.accessToken)
        } catch (error) {
            console.error(`Could not revoke the ${service.id} token at the provider: ${describeOAuthError(error)}`)
        }
    }

    return {
        //service methods here

        //lists all subscriptions for a user
        async list(userId: string){
            return repo.listByUser(userId)
        },

        //subscribes a user to a service
        async subscribe(userId: string, serviceId: string, credentials: Record<string, unknown>) {
            const service = registry.getService(serviceId) //get the service from the registry

            if (!service) {
                throw new AppError(404, 'NOT_FOUND', "This service does not exist.") //if the service is not found, throw an error (cannot register to an inexistant service)
            }
            if (service.auth.kind !== 'apiKey') { //oauth2 services subscribe through GET /:service/authorize instead
                 throw new AppError(400, 'NOT_API_KEY', 'This service does not use an API key') //
            }

            //validate the credentials; keep the cleaned copy (unknown keys dropped, defaults filled in)
            let validated: Record<string, unknown>
            try {
                validated = validateParams(service.auth.fields, credentials)
            } catch (error) {
                if (error instanceof WidgetFetchError) {
                    throw new AppError(400, 'INVALID_CREDENTIALS', error.message)
                }
                throw error
            }

            return repo.upsert(userId, serviceId, validated) //create or update the subscription
        },

        //deletes first, then tells the provider to forget the token: a provider outage must never block unsubscribing
        async unsubscribe(userId: string, serviceId: string) {
            const row = await repo.find(userId, serviceId) //read it before deleting, we need the token to revoke it
            const deleted = await repo.delete(userId, serviceId)

            if (!deleted) {
                throw new AppError(404, 'NOT_FOUND', "This subscription does not exist.") //if the subscription is not found, throw an error
            }
            const service = registry.getService(serviceId)
            if (row && service)
                await revokeQuietly(service, row.credentials)
        },

        /**
         * Tells the providers to forget the tokens of all these subscriptions, in
         * parallel. For an account deletion: the rows are already gone, so the
         * caller hands over what it read before. Never throws: a failed
         * revocation is logged by revokeQuietly, like in unsubscribe.
         */
        async revokeAll(rows: ServiceSubscriptionInstance[]): Promise<void> {
            const results = await Promise.allSettled(rows.map(async (row) => {
                const service = registry.getService(row.serviceId)
                if (service) //a service removed from the registry has no provider to ask
                    await revokeQuietly(service, row.credentials)
            }))

            //revokeQuietly logs a provider that answers badly; this is for what breaks before the call (a provider that can't be built)
            results.forEach((result, index) => {
                if (result.status === 'rejected')
                    console.error(`Could not revoke the ${rows[index]!.serviceId} token at the provider: ${describeOAuthError(result.reason)}`)
            })
        },

        /**
         * Step 1 of connecting an oauth2 service: builds the provider URL to send
         * the browser to, and the encrypted value of the oauth_pending cookie
         * that step 2 (finishOAuth) checks.
         */
        startOAuth(userId: string | null, serviceId: string): { url: URL; pending: string } {
            if (!userId)
                throw new OAuthFlowError('unauthorized')
            const { provider, scopes } = oauthServiceOrThrow(serviceId)

            const state = generateState()
            const codeVerifier = provider.pkce ? generateCodeVerifier() : null
            const pending: PendingOAuth = { state, codeVerifier, serviceId, userId, createdAt: now().getTime() }

            return {
                url: provider.authorizationUrl(state, codeVerifier, scopes),
                pending: encrypt(JSON.stringify(pending)),
            }
        },

        /**
         * Step 2: the provider sent the user back. Checks that this answers a
         * flow this same user started less than 10 minutes ago, trades the code
         * for tokens and saves them. Resolves to the service id.
         * The order of the checks matters: nothing from the query is trusted
         * before the state matched.
         */
        async finishOAuth(input: OAuthCallbackInput): Promise<string> {
            const pending = readPending(input.pending)
            if (!pending || !input.query.state || input.query.state !== pending.state)
                throw new OAuthFlowError('invalid_state')
            if (now().getTime() - pending.createdAt > OAUTH_FLOW_MAX_AGE_MS)
                throw new OAuthFlowError('expired')
            if (input.query.error)
                throw new OAuthFlowError(input.query.error === 'access_denied' ? 'denied' : 'provider_error')
            if (!input.userId)
                throw new OAuthFlowError('unauthorized')
            if (input.userId !== pending.userId)
                throw new OAuthFlowError('session_mismatch')

            const service = registry.getService(pending.serviceId)
            if (!service || service.auth.kind !== 'oauth2' || !isOAuthProviderId(input.providerId)
                || service.auth.provider !== input.providerId)
                throw new OAuthFlowError('invalid_state')
            const provider = getProvider(input.providerId)
            if (!provider)
                throw new OAuthFlowError('not_configured')
            if (!input.query.code)
                throw new OAuthFlowError('provider_error')

            let credentials
            try {
                credentials = await provider.exchangeCode(input.query.code, pending.codeVerifier)
            } catch (error) {
                //name and OAuth code only: the error may hold the provider's response
                console.error(`OAuth code exchange for ${service.id} failed: ${describeOAuthError(error)}`)
                throw new OAuthFlowError('exchange_failed')
            }

            await repo.upsert(input.userId, service.id, { ...credentials }) //also sets a needs_reauth row back to active
            return service.id
        },
    }
}

export type SubscriptionsService = ReturnType<typeof createSubscriptionsService>
