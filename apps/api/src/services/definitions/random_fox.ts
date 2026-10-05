/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** random_fox
** returns: https://randomfox.ca/floof/ which is returns json like this: {"image":"https:\/\/randomfox.ca\/images\/102.jpg","link":"https:\/\/randomfox.ca\/?i=102"}
** we wnt to display the image in the widget, so we need to return the image url
*/

import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

export const randomFoxService: ServiceDef = {
    id: 'random_fox',
    name: 'Random Fox',
    auth: { kind: 'none' },
    widgets: [
        {
            id: 'random_fox',
            name: 'Random Fox Picture',
            description: 'A random fox image',
            params: [],
            refresh: { default: 60, min: 10 },
            async fetch(ctx) {
                const body = await ctx.http.json<{ image?: string }>('https://randomfox.ca/floof/')
                if (typeof body?.image !== 'string') {
                    throw new WidgetFetchError('upstream_error', 'Random Fox: unexpected body')
                }
                return { image: body.image }
            },
        },
    ],
}

