/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** parse
 */

export type PlayedTrack = {
    title: string
    /** every artist of the track, in Spotify's order; may be empty */
    artists: string[]
    /** the album name, or '' when Spotify sent none */
    album: string
    /** a small cover; always an https:// address when present */
    cover: string | null
    /** the track's page on Spotify; always an https:// address when present */
    url: string | null
    /** ISO date of the moment the track was played */
    playedAt: string
}

export type RecentlyPlayedData = {
    /** the most recent first, already cut to the widget's limit */
    tracks: PlayedTrack[]
}

function fail(): never {
    throw new Error('Unexpected Spotify recently played data')
}

// The Eden client turns every ISO date string in a response into a Date, so
// "2026-10-09T08:15:30.123Z" reaches us as a Date. Bring it back to a string.
function parseDate(value: unknown): string {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? fail() : value.toISOString()
    }
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
        return value
    }
    return fail()
}

// These values end up in an <a href> and an <img src>. Anything that is not
// https:// is refused, which also keeps out addresses such as
// "javascript:..." that would run code when clicked.
function parseAddress(value: unknown): string | null {
    if (value === null) {
        return null
    }
    if (typeof value === 'string' && value.startsWith('https://')) {
        return value
    }
    return fail()
}

function parseTrack(raw: unknown): PlayedTrack {
    if (typeof raw !== 'object' || raw === null) {
        return fail()
    }
    const { title, artists, album, cover, url, playedAt } = raw as Record<
        string,
        unknown
    >
    if (typeof title !== 'string' || title === '') {
        return fail()
    }
    if (!Array.isArray(artists)) {
        return fail()
    }
    if (!artists.every((artist) => typeof artist === 'string')) {
        return fail()
    }
    if (typeof album !== 'string') {
        return fail()
    }
    return {
        title,
        artists: artists as string[],
        album,
        cover: parseAddress(cover),
        url: parseAddress(url),
        playedAt: parseDate(playedAt),
    }
}

export function parseRecentlyPlayed(raw: unknown): RecentlyPlayedData {
    if (typeof raw !== 'object' || raw === null) {
        return fail()
    }
    const { tracks } = raw as Record<string, unknown>
    if (!Array.isArray(tracks)) {
        return fail()
    }
    return { tracks: tracks.map(parseTrack) }
}
