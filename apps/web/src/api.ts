import { treaty } from '@elysiajs/eden'
import type { App } from '../../api/src/app'

// Every backend route lives under /api, so expose that subtree directly:
// `api.auth.login.post()` → POST /api/auth/login.
//
// In production the frontend and the API are deployed separately, so
// VITE_API_URL (baked in at build time) points at the API. Locally it is
// unset and the page origin is used, with the Vite proxy forwarding /api.
export const baseUrl = import.meta.env.VITE_API_URL || window.location.origin

export const api = treaty<App>(baseUrl, {
    // The session is a cookie. Cross-origin fetches only carry cookies with
    // credentials: 'include'; the API's CORS config allows it for WEB_URL.
    fetch: { credentials: 'include' },
}).api

// Where the browser goes to connect an oauth2 service. Not a fetch: the page
// navigates there, the API redirects to the provider (e.g. GitHub), and the
// provider sends the user back to /dashboard?connected=... or ?oauth_error=...
// A navigation is needed because the API sets a cookie for the flow, and
// browsers refuse cookies from cross-site fetch responses.
export function connectUrl(serviceId: string) {
    return `${baseUrl}/api/subscriptions/${encodeURIComponent(serviceId)}/authorize`
}
