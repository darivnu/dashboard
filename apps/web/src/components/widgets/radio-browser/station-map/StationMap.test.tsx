import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { makeInstance } from '../../../../test/apiMock'
import { FakeAudio } from './fakeAudio'
import { FakeMap, pointFeature, resetFakeMaplibre } from './fakeMaplibre'
import type { Station } from './parse'
import StationMap from './StationMap'

vi.mock(
    'maplibre-gl',
    async () => (await import('./fakeMaplibre')).maplibreModule,
)

function station(id: string, hls = false): Station {
    return {
        id,
        name: `Radio ${id}`,
        streamUrl: `https://example.com/${id}`,
        favicon: null,
        hls,
        lat: 1,
        lng: 2,
    }
}

const one = station('one')
const two = station('two')
const three = station('three')
const hlsOnly = station('hls', true)

function setNativeHls(supported: boolean) {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
        supported ? 'maybe' : '',
    )
}

function widget(stations: Station[], title = 'Map') {
    const instance = makeInstance({
        serviceId: 'radio_browser',
        widgetId: 'station_map',
        title,
        params: { limit: stations.length },
    })
    return (
        <section aria-label={title}>
            <StationMap
                instance={instance}
                params={instance.params}
                data={{ stations }}
            />
        </section>
    )
}

function featureIds(map: FakeMap) {
    const data = map.getSource('stations')?.data as {
        features: { properties: { id: string } }[]
    }
    return data.features.map((feature) => feature.properties.id)
}

async function clickStation(map: FakeMap, target: Station) {
    await act(() =>
        map.fire('click', 'station-points', {
            features: [pointFeature({ id: target.id, name: target.name })],
        }),
    )
}

beforeEach(() => {
    resetFakeMaplibre()
    FakeAudio.install()
    setNativeHls(false)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        {} as RenderingContext,
    )
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false })),
    )
})

afterEach(() => {
    vi.unstubAllGlobals()
})

test('an empty result says there are no stations', () => {
    render(widget([]))
    expect(screen.getByText('No stations to show.')).toBeVisible()
    expect(FakeMap.instances).toHaveLength(0)
})

test('shows the stations on the globe and invites to pick one', async () => {
    render(widget([one, two]))
    const map = FakeMap.last
    await act(() => map.fire('style.load'))

    expect(featureIds(map)).toEqual(['one', 'two'])
    expect(screen.getByText('Click a station to listen.')).toBeVisible()
})

test('HLS stations are left off where the browser cannot play them', async () => {
    setNativeHls(false)
    render(widget([one, hlsOnly, two]))
    const map = FakeMap.last
    await act(() => map.fire('style.load'))
    expect(featureIds(map)).toEqual(['one', 'two'])
})

test('HLS stations are shown where the browser plays them natively', async () => {
    setNativeHls(true)
    render(widget([one, hlsOnly, two]))
    const map = FakeMap.last
    await act(() => map.fire('style.load'))
    expect(featureIds(map)).toEqual(['one', 'hls', 'two'])
})

test('only HLS stations in a browser without HLS counts as no stations', () => {
    setNativeHls(false)
    render(widget([hlsOnly]))
    expect(screen.getByText('No stations to show.')).toBeVisible()
})

test('clicking a station starts it: connecting, then playing', async () => {
    render(widget([one, two]))
    const map = FakeMap.last
    await act(() => map.fire('style.load'))

    await clickStation(map, two)
    const audio = FakeAudio.last
    expect(audio.src).toBe('https://example.com/two')
    expect(screen.getByText('Radio two')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Connecting…')

    act(() => audio.emit('playing'))
    expect(screen.getByRole('status')).toHaveTextContent('Playing')
    expect(map.setPaintProperty).toHaveBeenLastCalledWith(
        'station-points',
        'circle-color',
        ['case', ['==', ['get', 'id'], 'two'], '#f59e0b', '#60a5fa'],
    )
})

test('another station replaces the one playing', async () => {
    render(widget([one, two]))
    const map = FakeMap.last
    await act(() => map.fire('style.load'))
    await clickStation(map, one)
    act(() => FakeAudio.last.emit('playing'))

    await clickStation(map, two)
    expect(FakeAudio.instances).toHaveLength(1)
    expect(FakeAudio.last.src).toBe('https://example.com/two')
    expect(screen.getByText('Radio two')).toBeVisible()
    expect(screen.queryByText('Radio one')).not.toBeInTheDocument()
})

test('a station that fails says so, and another can be played straight away', async () => {
    render(widget([one, two]))
    const map = FakeMap.last
    await act(() => map.fire('style.load'))
    await clickStation(map, one)

    act(() => FakeAudio.last.emit('error'))
    expect(screen.getByRole('status')).toHaveTextContent(
        "This station isn't available right now.",
    )
    // a failed station is not highlighted
    expect(map.setPaintProperty).toHaveBeenLastCalledWith(
        'station-points',
        'circle-color',
        ['case', ['==', ['get', 'id'], ''], '#f59e0b', '#60a5fa'],
    )

    await clickStation(map, two)
    act(() => FakeAudio.last.emit('playing'))
    expect(screen.getByRole('status')).toHaveTextContent('Playing')
})

test('Pause, Mute and the volume slider control the audio', async () => {
    render(widget([one]))
    const map = FakeMap.last
    await act(() => map.fire('style.load'))
    await clickStation(map, one)
    const audio = FakeAudio.last
    act(() => audio.emit('playing'))

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('status')).toHaveTextContent('Paused')
    expect(audio.src).toBe('')

    await userEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(audio.muted).toBe(true)
})

test('a refresh does not interrupt playback, even when the playing station is gone', async () => {
    const { rerender } = render(widget([one, two]))
    const map = FakeMap.last
    await act(() => map.fire('style.load'))
    await clickStation(map, one)
    const audio = FakeAudio.last
    act(() => audio.emit('playing'))
    const playCalls = audio.play.mock.calls.length

    // refreshed data without the playing station
    rerender(widget([two, three]))

    expect(featureIds(map)).toEqual(['two', 'three'])
    expect(FakeMap.instances).toHaveLength(1)
    expect(FakeAudio.instances).toHaveLength(1)
    expect(audio.src).toBe('https://example.com/one')
    expect(audio.play).toHaveBeenCalledTimes(playCalls)
    expect(audio.pause).not.toHaveBeenCalled()
    expect(screen.getByText('Radio one')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Playing')
})

test('two instances show different stations and play independently', async () => {
    render(
        <>
            {widget([one, two, three], 'Big')}
            {widget([one], 'Small')}
        </>,
    )
    const [bigMap, smallMap] = FakeMap.instances
    await act(() => bigMap.fire('style.load'))
    await act(() => smallMap.fire('style.load'))

    expect(featureIds(bigMap)).toHaveLength(3)
    expect(featureIds(smallMap)).toHaveLength(1)

    await clickStation(bigMap, two)
    await clickStation(smallMap, one)
    const [bigAudio, smallAudio] = FakeAudio.instances
    act(() => bigAudio.emit('playing'))
    act(() => smallAudio.emit('playing'))

    const big = within(screen.getByRole('region', { name: 'Big' }))
    const small = within(screen.getByRole('region', { name: 'Small' }))
    expect(big.getByText('Radio two')).toBeVisible()
    expect(small.getByText('Radio one')).toBeVisible()
    expect(bigAudio.src).toBe('https://example.com/two')
    expect(smallAudio.src).toBe('https://example.com/one')

    // pausing one leaves the other playing
    await userEvent.click(big.getByRole('button', { name: 'Pause' }))
    expect(big.getByRole('status')).toHaveTextContent('Paused')
    expect(small.getByRole('status')).toHaveTextContent('Playing')
    expect(smallAudio.src).toBe('https://example.com/one')
})
