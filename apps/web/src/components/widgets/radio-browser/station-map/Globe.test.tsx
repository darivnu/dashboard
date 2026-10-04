import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
    FakeMap,
    FakePopup,
    pointFeature,
    resetFakeMaplibre,
    workerUrls,
} from './fakeMaplibre'
import Globe from './Globe'
import type { Station } from './parse'

vi.mock(
    'maplibre-gl',
    async () => (await import('./fakeMaplibre')).maplibreModule,
)

function station(id: string, lat = 0, lng = 0): Station {
    return {
        id,
        name: `Radio ${id}`,
        streamUrl: `https://example.com/${id}`,
        favicon: null,
        hls: false,
        lat,
        lng,
    }
}

const paris = station('paris', 48.85, 2.35)
const tokyo = station('tokyo', 35.68, 139.69)
const lima = station('lima', -12.05, -77.04)

function setWebGL(available: boolean) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        available ? ({} as RenderingContext) : null,
    )
}

function setReducedMotion(reduce: boolean) {
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: reduce })),
    )
}

async function setup(
    stations: Station[] = [paris, tokyo],
    playingId: string | null = null,
) {
    const onPlay = vi.fn()
    const view = render(
        <Globe stations={stations} playingId={playingId} onPlay={onPlay} />,
    )
    const map = FakeMap.last
    await act(() => map.fire('style.load'))
    const source = map.getSource('stations')
    if (!source) throw new Error('the stations source was not added')
    return { onPlay, map, source, ...view }
}

function ids(data: unknown) {
    return (
        data as { features: { properties: { id: string } }[] }
    ).features.map((feature) => feature.properties.id)
}

beforeEach(() => {
    resetFakeMaplibre()
    setWebGL(true)
    setReducedMotion(false)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

test('tells MapLibre where its worker script is', () => {
    // Without this the globe is an empty sphere: tiles and bubbles are
    // prepared in the worker, and a bundled MapLibre cannot find it by itself.
    expect(workerUrls).toHaveLength(1)
    expect(workerUrls[0]).toContain('maplibre-gl-worker')
})

describe('the map', () => {
    test('is a globe on the OpenFreeMap dark style, with the attribution kept', async () => {
        const { map } = await setup()
        expect(map.options.style).toBe(
            'https://tiles.openfreemap.org/styles/dark',
        )
        expect(map.options.attributionControl).not.toBe(false)
        expect(map.setProjection).toHaveBeenCalledWith({ type: 'globe' })
    })

    test('groups nearby stations', async () => {
        const { map } = await setup()
        expect(map.sourceOptions.get('stations')).toMatchObject({
            type: 'geojson',
            cluster: true,
        })
        expect(map.layers.map((layer) => layer.id)).toEqual([
            'station-groups',
            'station-group-counts',
            'station-points',
        ])
    })

    test('has one feature per station, at its coordinates', async () => {
        const { source } = await setup()
        expect(source.data).toEqual({
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [2.35, 48.85] },
                    properties: { id: 'paris', name: 'Radio paris' },
                },
                {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [139.69, 35.68] },
                    properties: { id: 'tokyo', name: 'Radio tokyo' },
                },
            ],
        })
    })

    test('refreshed data updates the bubbles without recreating the map', async () => {
        const { source, rerender } = await setup()

        rerender(
            <Globe
                stations={[paris, tokyo, lima]}
                playingId={null}
                onPlay={() => {}}
            />,
        )

        expect(ids(source.data)).toEqual(['paris', 'tokyo', 'lima'])
        expect(FakeMap.instances).toHaveLength(1)
    })

    test('is removed with the widget', async () => {
        const { map, unmount } = await setup()
        unmount()
        expect(map.remove).toHaveBeenCalledTimes(1)
    })
})

describe('stations', () => {
    test('clicking a station plays it', async () => {
        const { map, onPlay } = await setup()
        await act(() =>
            map.fire('click', 'station-points', {
                features: [pointFeature({ id: 'tokyo', name: 'Radio tokyo' })],
            }),
        )
        expect(onPlay).toHaveBeenCalledWith(tokyo)
    })

    test('a click uses the latest onPlay and the latest stations', async () => {
        const { map, rerender } = await setup()
        const later = vi.fn()
        rerender(<Globe stations={[lima]} playingId={null} onPlay={later} />)

        await act(() =>
            map.fire('click', 'station-points', {
                features: [pointFeature({ id: 'lima', name: 'Radio lima' })],
            }),
        )
        expect(later).toHaveBeenCalledWith(lima)
    })

    test('the name shows on hover and goes away after', async () => {
        const { map } = await setup()
        const popup = FakePopup.instances[0]

        await act(() =>
            map.fire('mouseenter', 'station-points', {
                features: [
                    pointFeature(
                        { id: 'paris', name: 'Radio paris' },
                        [2.35, 48.85],
                    ),
                ],
            }),
        )
        expect(popup).toMatchObject({
            shown: true,
            text: 'Radio paris',
            lngLat: [2.35, 48.85],
        })
        expect(map.canvas.style.cursor).toBe('pointer')

        await act(() => map.fire('mouseleave', 'station-points'))
        expect(popup.shown).toBe(false)
        expect(map.canvas.style.cursor).toBe('')
    })

    test('the playing station is highlighted', async () => {
        const { map, rerender } = await setup([paris, tokyo], null)
        expect(map.setPaintProperty).toHaveBeenLastCalledWith(
            'station-points',
            'circle-color',
            ['case', ['==', ['get', 'id'], ''], '#f59e0b', '#60a5fa'],
        )

        rerender(
            <Globe
                stations={[paris, tokyo]}
                playingId="tokyo"
                onPlay={() => {}}
            />,
        )
        expect(map.setPaintProperty).toHaveBeenLastCalledWith(
            'station-points',
            'circle-color',
            ['case', ['==', ['get', 'id'], 'tokyo'], '#f59e0b', '#60a5fa'],
        )
    })

    test('several stations under one click offer a list', async () => {
        const { map, onPlay } = await setup()
        await act(() =>
            map.fire('click', 'station-points', {
                features: [
                    pointFeature({ id: 'paris', name: 'Radio paris' }),
                    pointFeature({ id: 'tokyo', name: 'Radio tokyo' }),
                ],
            }),
        )
        expect(onPlay).not.toHaveBeenCalled()
        expect(screen.getByText('2 stations here')).toBeVisible()
    })
})

describe('groups', () => {
    const group = pointFeature({ cluster_id: 7, point_count: 2 }, [70, 40])

    test('clicking a group zooms in to where it splits', async () => {
        const { map, source } = await setup()
        source.leaves.set(7, [
            pointFeature({ id: 'paris' }),
            pointFeature({ id: 'tokyo' }),
        ])
        source.expansionZoom.set(7, 5)

        await act(() =>
            map.fire('click', 'station-groups', { features: [group] }),
        )

        expect(map.easeTo).toHaveBeenCalledWith({
            center: [70, 40],
            zoom: 5,
            duration: 500,
        })
        expect(screen.queryByText(/stations here/)).not.toBeInTheDocument()
    })

    test('the camera move is instant when the system asks for reduced motion', async () => {
        setReducedMotion(true)
        const { map, source } = await setup()
        source.leaves.set(7, [
            pointFeature({ id: 'paris' }),
            pointFeature({ id: 'tokyo' }),
        ])
        source.expansionZoom.set(7, 5)

        await act(() =>
            map.fire('click', 'station-groups', { features: [group] }),
        )
        expect(map.easeTo).toHaveBeenCalledWith(
            expect.objectContaining({ duration: 0 }),
        )
    })

    test('a group whose stations share one point opens a list, and picking one plays it', async () => {
        const first = station('first', 10, 20)
        const second = station('second', 10, 20)
        const { map, source, onPlay } = await setup([first, second, paris])
        source.leaves.set(7, [
            pointFeature({ id: 'first' }),
            pointFeature({ id: 'second' }),
        ])

        await act(() =>
            map.fire('click', 'station-groups', { features: [group] }),
        )

        expect(map.easeTo).not.toHaveBeenCalled()
        expect(screen.getByText('2 stations here')).toBeVisible()

        await userEvent.click(
            screen.getByRole('button', { name: 'Radio second' }),
        )
        expect(onPlay).toHaveBeenCalledWith(second)
        expect(screen.queryByText('2 stations here')).not.toBeInTheDocument()
    })

    test('the list can be closed without picking', async () => {
        const first = station('first', 10, 20)
        const second = station('second', 10, 20)
        const { map, source, onPlay } = await setup([first, second])
        source.leaves.set(7, [
            pointFeature({ id: 'first' }),
            pointFeature({ id: 'second' }),
        ])
        await act(() =>
            map.fire('click', 'station-groups', { features: [group] }),
        )

        await userEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(screen.queryByText('2 stations here')).not.toBeInTheDocument()
        expect(onPlay).not.toHaveBeenCalled()
    })
})

describe('without WebGL', () => {
    test('says the globe cannot be displayed and creates no map', () => {
        setWebGL(false)
        render(<Globe stations={[paris]} playingId={null} onPlay={() => {}} />)
        expect(
            screen.getByText("This browser can't display the globe."),
        ).toBeVisible()
        expect(FakeMap.instances).toHaveLength(0)
    })
})
