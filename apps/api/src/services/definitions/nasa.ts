/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** nasa
*/

import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

export const nasaService: ServiceDef = {
    id: 'nasa',
    name: 'NASA',
    auth: {
        kind: 'apiKey',
        fields: [{name: 'apiKey', label: 'Nasa API Key (api.nasa.gov)', type: 'string', required: true}],
    },
    widgets: [
        {
            id: 'apod',
            name: 'Astronomy Picture of the Day',
            description: 'The Astronomy Picture of the Day from NASA',
            params: [],
            refresh: { default: 1000, min: 300 },
            async fetch(ctx) {
                const key = String(ctx.credentials?.apiKey ?? 'DEMO_KEY') //the 2 question marks are used to handle the case where ctx.credentials is undefined or null, and the empty string is used as a fallback value if apiKey is not present in the credentials object.
                 const body = await ctx.http.json<Array<{
                        title?: string; explanation?: string; hdurl?: string;
                        media_type?: string; permalink?: string; date?: string; alt?: string
                    }>>(`https://science.nasa.gov/wp-json/wp/v2/apod-basic/?api_key=${encodeURIComponent(key)}`)
                //a few checks first

                const today = Array.isArray(body) ? body[0] : undefined
                if (!today || typeof today.title !== 'string') {
                    throw new WidgetFetchError('upstream_error', 'NASA: unexpected body')
                }
                if (typeof today.media_type !== 'string' || !['image'].includes(today.media_type)) {
                    throw new WidgetFetchError('upstream_error', 'NASA: unexpected media type')
                }
                return {
                    title: body[0].title,
                    date: body[0].date,
                    hdurl: body[0].hdurl,
                    media_type: body[0].media_type,
                    permalink: body[0].permalink,
                    alt: body[0].alt ?? 'No alt text available',
                    link: body[0].permalink,
                    explanation: (body[0].explanation ?? 'No explanation available').replace(/<[^>]*>/g, ''),
                }
            },
        },
    ],
}

