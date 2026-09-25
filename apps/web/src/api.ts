import { treaty } from '@elysiajs/eden'
import type { App } from '../../api/src/app'

// Every backend route lives under /api, so expose that subtree directly:
// `api.auth.login.post()` → POST /api/auth/login.
//
// The backend serves the web build itself, so by default the API is on the
// same origin as the page (window.location.origin = scheme + host + port the
// browser loaded us from). VITE_API_URL is a build-time override for the case
// where the frontend is hosted somewhere else.
const baseUrl = import.meta.env.VITE_API_URL || window.location.origin

export const api = treaty<App>(baseUrl).api
