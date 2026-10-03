import { treaty } from '@elysiajs/eden'
import type { App } from '../../api/src/app'

// Every backend route lives under /api, so expose that subtree directly:
// `api.auth.login.post()` → POST /api/auth/login.
//
// In production the frontend and the API are deployed separately, so
// VITE_API_URL (baked in at build time) points at the API. Locally it is
// unset and the page origin is used, with the Vite proxy forwarding /api.
const baseUrl = import.meta.env.VITE_API_URL || window.location.origin

export const api = treaty<App>(baseUrl, {
    // The session is a cookie. Cross-origin fetches only carry cookies with
    // credentials: 'include'; the API's CORS config allows it for WEB_URL.
    fetch: { credentials: 'include' },
}).api