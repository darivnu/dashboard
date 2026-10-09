/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** spotify
*/

import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

const RECENTLY_PLAYED_URL = 'https://api.spotify.com/v1/me/player/recently-played'

// The widget draws covers as small thumbnails. Spotify sends each cover in several sizes
// (640, 300 and 64 px for an album): we keep the smallest one that is still at least this wide
const MIN_COVER_WIDTH = 64

type SpotifyImage = { url?: unknown; width?: unknown }

type SpotifyPlay = {
    played_at?: unknown
    track?: {
        name?: unknown
        artists?: unknown
        album?: { name?: unknown; images?: unknown } | null
        external_urls?: { spotify?: unknown } | null
    } | null
}

// These two values end up in an <a href> and an <img src> in the browser,
// so anything that is not an https:// address is dropped here
function secureUrl(value: unknown): string | null {
    return typeof value === 'string' && value.startsWith('https://') ? value : null
}

function pickCover(images: unknown): string | null {
    if (!Array.isArray(images))
        return null

    let best: { url: string; width: number } | null = null
    for (const image of images as (SpotifyImage | null)[]) {
        const url = secureUrl(image?.url)
        const width = image?.width
        if (url === null || typeof width !== 'number' || width < MIN_COVER_WIDTH)
            continue
        if (best === null || width < best.width)
            best = { url, width }
    }
    return best?.url ?? null
}

function artistNames(artists: unknown): string[] {
    if (!Array.isArray(artists))
        return []
    return (artists as ({ name?: unknown } | null)[])
        .map((artist) => artist?.name)
        .filter((name): name is string => typeof name === 'string' && name !== '')
}

export const spotifyService: ServiceDef = {
    id: 'spotify',
    name: 'Spotify',
    auth: { kind: 'oauth2', provider: 'spotify', scopes: ['user-read-recently-played'] },
    widgets: [
        {
            id: 'recently_played',
            name: 'Recently played',
            description: 'The last tracks you listened to on Spotify',
            params: [{ name: 'limit', label: 'How many to show', type: 'integer', min: 1, max: 20, default: 5 }],
            refresh: { default: 300, min: 60 },
            async fetch(ctx, params) {
                if (!ctx.getAccessToken)
                    throw new WidgetFetchError('needs_reauth', 'Spotify: no account connected')
                const token = await ctx.getAccessToken()

                //401 (token revoked) and 403 (account not added to the app's users) become needs_reauth in the http client
                const body = await ctx.http.json<{ items?: unknown } | null>(
                    `${RECENTLY_PLAYED_URL}?limit=${Number(params.limit)}`,
                    { headers: { Authorization: `Bearer ${token}` } },
                )
                if (typeof body !== 'object' || body === null || !Array.isArray(body.items))
                    throw new WidgetFetchError('upstream_error', 'Spotify: unexpected body')

                //Spotify already sends the plays most recent first
                const tracks = (body.items as (SpotifyPlay | null)[]).map((play) => {
                    const track = play?.track
                    const title = track?.name
                    const playedAt = play?.played_at
                    if (typeof title !== 'string' || title === '' || typeof playedAt !== 'string' || playedAt === '')
                        throw new WidgetFetchError('upstream_error', 'Spotify: unexpected play')
                    return {
                        title,
                        artists: artistNames(track?.artists),
                        album: typeof track?.album?.name === 'string' ? track.album.name : '',
                        cover: pickCover(track?.album?.images),
                        url: secureUrl(track?.external_urls?.spotify),
                        playedAt,
                    }
                })

                return { tracks }
            },
        },
    ],
}
