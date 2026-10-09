import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { makeInstance } from '../../../../test/apiMock'
import type { PlayedTrack, RecentlyPlayedData } from './parse'
import RecentlyPlayed from './RecentlyPlayed'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const NOW = Date.parse('2026-10-09T12:00:00.000Z')

beforeEach(() => {
    // The rows say how long ago a track was played, so the clock is fixed.
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
})

afterEach(() => {
    vi.useRealTimers()
})

function track(title: string, overrides: Partial<PlayedTrack> = {}) {
    return {
        title,
        artists: ['The Killers'],
        album: 'Hot Fuss',
        cover: `https://i.scdn.co/image/${title}`,
        url: `https://open.spotify.com/track/${title}`,
        playedAt: new Date(NOW - 5 * MINUTE).toISOString(),
        ...overrides,
    }
}

function show(data: RecentlyPlayedData) {
    const instance = makeInstance({
        serviceId: 'spotify',
        widgetId: 'recently_played',
        params: { limit: 5 },
    })
    return render(
        <RecentlyPlayed
            instance={instance}
            params={instance.params}
            data={data}
        />,
    )
}

test('lists the tracks in the order given, one row each', () => {
    show({ tracks: [track('Third'), track('Second'), track('First')] })

    const rows = screen.getAllByRole('listitem')
    expect(
        rows.map((row) => within(row).getByText(/^\w+$/).textContent),
    ).toEqual(['Third', 'Second', 'First'])
})

test('a row shows the title, the artists joined with commas and how long ago it was played', () => {
    show({
        tracks: [
            track('Get Lucky', {
                artists: ['Daft Punk', 'Pharrell Williams', 'Nile Rodgers'],
                playedAt: new Date(NOW - 3 * HOUR).toISOString(),
            }),
        ],
    })

    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Get Lucky')).toBeInTheDocument()
    expect(
        within(row).getByText('Daft Punk, Pharrell Williams, Nile Rodgers'),
    ).toBeInTheDocument()
    expect(within(row).getByText('3 hours ago')).toBeInTheDocument()
})

test.each([
    // Under a minute, or "in the future" for a browser clock that runs slow.
    [5 * 1000, '1 minute ago'],
    [-2 * MINUTE, '1 minute ago'],
    [40 * 1000, '1 minute ago'],
    [5 * MINUTE, '5 minutes ago'],
    [26 * HOUR, 'yesterday'],
    [72 * HOUR, '3 days ago'],
])('a track played %i ms ago reads "%s"', (ago, text) => {
    show({
        tracks: [
            track('Song', { playedAt: new Date(NOW - ago).toISOString() }),
        ],
    })

    expect(screen.getByText(text)).toBeInTheDocument()
})

test('a row with a url is a link to the track that opens in a new tab', () => {
    show({ tracks: [track('Song')] })

    const link = screen.getByRole('link', { name: /Song/ })
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/track/Song')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
})

test('a row without a url is not a link', () => {
    show({ tracks: [track('Song', { url: null })] })

    expect(screen.getByText('Song')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
})

test('the cover is drawn when there is one, and left out when there is none', () => {
    const { container } = show({
        tracks: [track('Covered'), track('Bare', { cover: null })],
    })

    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAttribute('src', 'https://i.scdn.co/image/Covered')
})

test('a track without artists shows no artist line', () => {
    show({ tracks: [track('Song', { artists: [] })] })

    expect(screen.getByRole('listitem').querySelectorAll('p')).toHaveLength(1)
})

test('an empty list shows the empty-state line and no list', () => {
    show({ tracks: [] })

    expect(screen.getByText('Nothing played recently.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
})
