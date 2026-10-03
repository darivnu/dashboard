/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** advice
*/

import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

export const adviceService: ServiceDef = {
    id: 'advice_slip',
    name: 'Advice Slip',
    auth: { kind: 'none' },
    widgets: [
        {
            id: 'random_advice',
            name: 'Random advice',
            description: 'A random piece of advice',
            params: [],
            refresh: { default: 300, min: 30 },
            async fetch(ctx) {
                const body = await ctx.http.json<{ slip?: { advice?: unknown } }>('https://api.adviceslip.com/advice')
                if (typeof body?.slip?.advice !== 'string') {
                    throw new WidgetFetchError('upstream_error', 'Advice Slip: unexpected body')
                }
                return { advice: body.slip.advice }
            },
        },
    ],
}

