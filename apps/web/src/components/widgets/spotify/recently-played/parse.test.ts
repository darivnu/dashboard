import { expect, test } from 'vitest'
import { parseRecentlyPlayed } from './parse'

const track = {
    title: 'Mr. Brightside',
    artists: ['The Killers'],
    album: 'Hot Fuss',
    cover: 'https://i.scdn.co/image/small',
    url: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp',
    playedAt: '2026-10-09T08:15:30.123Z',
}

const bare = {
    ...track,
    title: 'Local file',
    artists: [],
    album: '',
    cover: null,
    url: null,
}

test('keeps what the widget draws', () => {
    const data = { tracks: [track, bare] }
    expect(parseRecentlyPlayed(data)).toEqual(data)
})

test('accepts an empty list', () => {
    expect(parseRecentlyPlayed({ tracks: [] })).toEqual({ tracks: [] })
})

test('leaves out fields the widget does not know', () => {
    const data = { tracks: [{ ...track, popularity: 87 }], next: 'cursor' }
    expect(parseRecentlyPlayed(data)).toEqual({ tracks: [track] })
})

// The API client turns text that looks like an ISO date into a Date object
// before the widget sees it, so this is the form playedAt really arrives in.
test('accepts playedAt as a Date and returns it as ISO text', () => {
    const asDate = { ...track, playedAt: new Date(track.playedAt) }
    expect(parseRecentlyPlayed({ tracks: [asDate] })).toEqual({
        tracks: [track],
    })
})

test('accepts playedAt as a string', () => {
    expect(parseRecentlyPlayed({ tracks: [track] }).tracks[0].playedAt).toBe(
        track.playedAt,
    )
})

test('accepts a null cover and a null url', () => {
    const [parsed] = parseRecentlyPlayed({ tracks: [bare] }).tracks
    expect(parsed.cover).toBeNull()
    expect(parsed.url).toBeNull()
})

test.each([
    ['null', null],
    ['text', 'tracks'],
    ['a list', [track]],
    ['an object without tracks', {}],
    ['tracks that is not a list', { tracks: 'many' }],
])('throws on %s', (_label, raw) => {
    expect(() => parseRecentlyPlayed(raw)).toThrow(
        'Unexpected Spotify recently played data',
    )
})

test.each([
    ['a track that is not an object', 'Mr. Brightside'],
    ['a null track', null],
    ['a missing title', { ...track, title: undefined }],
    ['an empty title', { ...track, title: '' }],
    ['artists that is not a list', { ...track, artists: 'The Killers' }],
    ['an artist that is not text', { ...track, artists: ['The Killers', 7] }],
    ['an album that is not text', { ...track, album: null }],
    ['a cover that is not https', { ...track, cover: 'http://i.scdn.co/a' }],
    ['a missing cover', { ...track, cover: undefined }],
    ['a url that would run code', { ...track, url: 'javascript:alert(1)' }],
    ['a missing url', { ...track, url: undefined }],
    ['a missing playedAt', { ...track, playedAt: undefined }],
    ['a playedAt that is not a date', { ...track, playedAt: 'yesterday' }],
    ['an invalid Date', { ...track, playedAt: new Date('nope') }],
    ['a numeric playedAt', { ...track, playedAt: 1760000000000 }],
])('throws on %s', (_label, bad) => {
    expect(() => parseRecentlyPlayed({ tracks: [track, bad] })).toThrow(
        'Unexpected Spotify recently played data',
    )
})
