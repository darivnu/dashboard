/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** nasa
*/

import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

type NeoFeed = {
    element_count?: number
    near_earth_objects?: Record<string, Array<{
        name?: string
        is_potentially_hazardous_asteroid?: boolean
        estimated_diameter?: { meters?: { estimated_diameter_max?: number } }
        close_approach_data?: Array<{
            close_approach_date_full?: string
            miss_distance?: { kilometers?: string; lunar?: string }
        }>
    }>>
}

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
                    title: today.title,
                    date: today.date,
                    hdurl: today.hdurl,
                    media_type: today.media_type,
                    permalink: today.permalink,
                    alt: today.alt ?? 'No alt text available',
                    link: today.permalink,
                    explanation: (today.explanation ?? 'No explanation available').replace(/<[^>]*>/g, ''),
                }
            },
        },
        {
            id: 'neows',
            name: 'Near Earth Objects',
            description: 'Near Earth Objects from NASA',
            params: [{name: 'days', label: 'Days Ahead', type: 'integer', min: 1, max: 7, default: 3}],
            refresh: { default: 3600, min: 600 },
            async fetch(ctx, params) {
                const key = String(ctx.credentials?.apiKey ?? 'DEMO_KEY')
                const days = Number(params.days)

                const ONE_DAY = 24 * 60 * 60 * 1000
                const start = new Date()
                const end = new Date(start.getTime() + (days - 1) * ONE_DAY) //-1 cus we want to include today in the range
                const fmt = (d: Date) => d.toISOString().slice(0, 10)

                const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${fmt(start)}&end_date=${fmt(end)}&api_key=${encodeURIComponent(key)}`
                const body = await ctx.http.json<NeoFeed>(url)
                //do a few checks first
                if (!body.near_earth_objects || typeof body.near_earth_objects !== 'object') {
                    throw new WidgetFetchError('upstream_error', 'NASA NeoWs: unexpected body')
                }
                const all = Object.values(body.near_earth_objects).flat() //flatten the array of arrays into a single array

                //now we simplify, sort, and return the data

                const asteroids = all.map((a) => {
                    const approach = a.close_approach_data?.[0]
                    return {
                        name: a.name ?? 'Unknown',
                        date: approach?.close_approach_date_full ?? '',
                        distanceKm: Number(approach?.miss_distance?.kilometers ?? NaN),
                        distanceLunar: Number(approach?.miss_distance?.lunar ?? NaN),
                        diameterM: Math.round(a.estimated_diameter?.meters?.estimated_diameter_max ?? 0),
                        hazardous: a.is_potentially_hazardous_asteroid === true,
                    }
                })
                    .filter((a) => Number.isFinite(a.distanceKm))
                    .sort((a, b) => a.distanceKm - b.distanceKm)

                return {
                    days,
                    count: asteroids.length,
                    hazardousCount: asteroids.filter((a) => a.hazardous).length,
                    asteroids: asteroids.slice(0, 5),
                }
            },
        }
    ],
}

