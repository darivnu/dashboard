import { treaty } from '@elysiajs/eden'
import type { App } from '../../api/src/app'

export const api = treaty<App>('http://localhost:5173')