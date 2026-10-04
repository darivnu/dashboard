/**
 * Radio Browser — a free, keyless index of internet radio stations.
 * https://api.radio-browser.info
 *
 * One widget, `station_map`: the most-listened stations worldwide that have
 * coordinates, so the frontend can draw one bubble per station on a map and
 * play its stream on click. One pinned station is added on top of them.
 *
 * Every request goes through `ctx.http`, which already turns a 429 into
 * `rate_limited` and any other HTTP or network failure into `upstream_error`.
 * This file only adds the checks the upstream cannot do for us: the body's
 * shape, and cleaning station rows before they reach the frontend.
 */
import type { FetchCtx, ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

/**
 * The upstream's round-robin DNS name: each lookup resolves to one of its
 * mirrors, so we never pick (or retry) a mirror ourselves.
 */
const BASE_URL = 'https://all.api.radio-browser.info'

/** The upstream asks every client to identify itself with a descriptive User-Agent. */
const USER_AGENT = 'Dashboard/0.1 (+https://github.com/darivnu/Dashboard)'

/**
 * Rows asked for beyond the requested limit, so the list can be refilled
 * after unusable rows and duplicates are removed. Without an explicit limit
 * the upstream returns up to 100 000 rows.
 */
const EXTRA_ROWS = 10

/** Bounds and default of the `limit` param: how many bubbles the map shows. */
const MIN_STATIONS = 1
const MAX_STATIONS = 999
const DEFAULT_STATIONS = 200

/**
 * A station shown on every map whatever its rank: "Spinning Seal FM", kept as
 * an easter egg. It would never arrive through the search: its directory
 * entry has no coordinates and far too few clicks. It is looked up by id, so
 * its name and stream stay current, and placed at this fixed position. The position is
 * Epitech Madrid as an Easter Egg
 */
const PINNED_STATION = {
    id: '79930fba-66b9-42cc-8b40-cf766176a38d',
    lat: 40.423194,
    lng: -3.710889,
}

type Query = Record<string, string | number | boolean>

/** One bubble on the map, as the frontend receives it. */
interface Station {
    id: string
    name: string
    streamUrl: string
    favicon: string | null
    /** true = HLS stream: a plain <audio> element only plays it in Safari; elsewhere use hls.js. */
    hls: boolean
    lat: number
    lng: number
}

async function get(ctx: FetchCtx, path: string, query: Query): Promise<unknown> {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
        search.set(key, String(value))
    }

    const queryString = search.size > 0 ? `?${search}` : ''
    return ctx.http.json(`${BASE_URL}${path}${queryString}`, {
        headers: { 'User-Agent': USER_AGENT },
    })
}

/** Trimmed string, or null when the value is missing, not a string or blank. */
function text(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

/** The value when it is a real number within ±`bound`, otherwise null. */
function coordinate(value: unknown, bound: number): number | null {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= bound ? value : null
}

/**
 * Turns one upstream row into a Station, or null when the row cannot become
 * a playable bubble: no `stationuuid`, no https:// stream (the page is served
 * over https, so the browser would block an http:// one) or no coordinates.
 */
function cleanStation(raw: unknown): Station | null {
    if (typeof raw !== 'object' || raw === null) return null
    const row = raw as Record<string, unknown>

    const id = text(row.stationuuid)
    // url_resolved is the playable stream; `url` may be a .pls/.m3u playlist.
    const streamUrl = text(row.url_resolved)
    const lat = coordinate(row.geo_lat, 90)
    const lng = coordinate(row.geo_long, 180)
    if (!id || !streamUrl?.startsWith('https://') || lat === null || lng === null) return null

    const favicon = text(row.favicon)

    return {
        id,
        name: typeof row.name === 'string' ? row.name.trim() : '',
        streamUrl,
        // Same reason as streamUrl: an http:// image would be blocked.
        favicon: favicon?.startsWith('https://') ? favicon : null,
        hls: row.hls === 1,
        lat,
        lng,
    }
}

/**
 * The pinned station, or null when it cannot be shown. A failed lookup must
 * not take the map down with it, so every failure here means "leave it out".
 */
async function fetchPinnedStation(ctx: FetchCtx): Promise<Station | null> {
    try {
        const body = await get(ctx, `/json/stations/byuuid/${PINNED_STATION.id}`, {})
        const row: unknown = Array.isArray(body) ? body[0] : null
        if (typeof row !== 'object' || row === null) return null

        // Same checks as every other row, with our coordinates in place of the entry's.
        return cleanStation({ ...row, geo_lat: PINNED_STATION.lat, geo_long: PINNED_STATION.lng })
    } catch {
        return null
    }
}

/**
 * Drops stations whose stream was already seen and stops at `limit`. Rows
 * arrive most listened first, so the copy kept is the most listened one.
 */
function dedupe(stations: Station[], limit: number): Station[] {
    const seen = new Set<string>()
    const kept: Station[] = []

    for (const station of stations) {
        if (seen.has(station.streamUrl)) continue
        seen.add(station.streamUrl)
        kept.push(station)
        if (kept.length === limit) break
    }

    return kept
}

export const radioBrowserService: ServiceDef = {
    id: 'radio_browser',
    name: 'Radio Browser',
    auth: { kind: 'none' },

    widgets: [
        {
            id: 'station_map',
            name: 'Station map',
            description: 'The most-listened radio stations worldwide on a map; click a bubble to listen',
            params: [
                {
                    name: 'limit',
                    label: 'How many stations to show on the map',
                    type: 'integer',
                    default: DEFAULT_STATIONS,
                    min: MIN_STATIONS,
                    max: MAX_STATIONS,
                },
            ],

            /**
             * The upstream rebuilds its cache every 120 s and keeps entries
             * for 600 s, so polling faster than `min` could not return
             * fresher data anyway.
             */
            refresh: { default: 600, min: 120 },

            async fetch(ctx, params) {
                // Validated against the param's min/max before fetch() runs,
                // so no clamp is needed here.
                const limit = Number(params.limit)

                const [body, pinned] = await Promise.all([
                    get(ctx, '/json/stations/search', {
                        has_geo_info: true,
                        is_https: true,
                        hidebroken: true,
                        order: 'clickcount',
                        reverse: true,
                        limit: limit + EXTRA_ROWS,
                    }),
                    fetchPinnedStation(ctx),
                ])

                if (!Array.isArray(body)) {
                    throw new WidgetFetchError('upstream_error', 'Radio Browser: station list is not an array')
                }

                const stations = body
                    .map(cleanStation)
                    .filter((station): station is Station => station !== null)

                const listed = dedupe(stations, limit)

                // Added on top of `limit`, unless the search already returned it.
                const alreadyListed =
                    pinned !== null &&
                    listed.some((station) => station.id === pinned.id || station.streamUrl === pinned.streamUrl)
                if (pinned !== null && !alreadyListed) listed.push(pinned)

                return { stations: listed }
            },
        },
    ],
}
