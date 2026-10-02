import { treaty } from '@elysiajs/eden'
import type { App } from '../../api/src/app'

const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

export const api = treaty<App>(baseUrl, {
    fetch: { credentials: 'include' },
}).api