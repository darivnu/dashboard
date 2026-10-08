import {
    type ExpressionSpecification,
    type GeoJSONSource,
    type MapLayerMouseEvent,
    Map as MapLibreMap,
    Popup,
    setWorkerUrl,
} from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import Alert from '../../../ui/Alert'
import Button from '../../../ui/Button'
import type { Station } from './parse'

type Props = {
    stations: Station[]
    /** the station to highlight, or null */
    playingId: string | null
    onPlay: (station: Station) => void
}

// MapLibre prepares tiles and the station bubbles in a web worker, a second
// script it loads from a file next to its own. A bundler moves the library, so
// that file is no longer there; this hands MapLibre the address Vite gives it.
setWorkerUrl(workerUrl)

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'
const SOURCE = 'stations'
const GROUPS = 'station-groups'
const GROUP_COUNTS = 'station-group-counts'
const POINTS = 'station-points'
/** Above this zoom nothing is grouped, so every group splits before it. */
const GROUP_MAX_ZOOM = 14

function supportsWebGL() {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function toGeoJson(stations: Station[]): GeoJSON.FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: stations.map((station) => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [station.lng, station.lat],
            },
            properties: { id: station.id, name: station.name },
        })),
    }
}

// The colour of a station bubble: amber for the one playing, blue otherwise.
function pointColor(playingId: string | null): ExpressionSpecification {
    return [
        'case',
        ['==', ['get', 'id'], playingId ?? ''],
        '#f59e0b',
        '#60a5fa',
    ]
}

export default function Globe({ stations, playingId, onPlay }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<MapLibreMap | null>(null)
    // The map's click handlers are attached once; these refs let them see
    // the current stations and the current onPlay.
    const stationsRef = useRef(new Map<string, Station>())
    const onPlayRef = useRef(onPlay)
    const [ready, setReady] = useState(false)
    const [unsupported, setUnsupported] = useState(false)
    const [choices, setChoices] = useState<Station[] | null>(null)

    useEffect(() => {
        onPlayRef.current = onPlay
    }, [onPlay])

    // Create the map once, and remove it with the widget.
    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        if (!supportsWebGL()) {
            setUnsupported(true)
            return
        }

        let map: MapLibreMap
        try {
            map = new MapLibreMap({
                container,
                style: STYLE_URL,
                center: [10, 25],
                zoom: 1.2,
                attributionControl: { compact: true },
            })
        } catch {
            setUnsupported(true)
            return
        }
        mapRef.current = map

        const popup = new Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
        })

        const stationsOf = (features: MapLayerMouseEvent['features']) =>
            (features ?? [])
                .map((feature) =>
                    stationsRef.current.get(String(feature.properties.id)),
                )
                .filter((station) => station !== undefined)

        const onPointClick = (event: MapLayerMouseEvent) => {
            const found = stationsOf(event.features)
            // Several stations exactly on top of each other: let the user pick.
            if (found.length > 1) setChoices(found)
            else if (found.length === 1) onPlayRef.current(found[0])
        }

        const onGroupClick = async (event: MapLayerMouseEvent) => {
            const group = event.features?.[0]
            if (group?.geometry.type !== 'Point') return
            const source = map.getSource<GeoJSONSource>(SOURCE)
            if (!source) return
            const clusterId = Number(group.properties.cluster_id)
            const [lng, lat] = group.geometry.coordinates

            const leaves = await source.getClusterLeaves(
                clusterId,
                Number(group.properties.point_count),
                0,
            )
            const members = stationsOf(leaves as MapLayerMouseEvent['features'])
            const samePoint = members.every(
                (station) =>
                    station.lat === members[0].lat &&
                    station.lng === members[0].lng,
            )
            if (samePoint) {
                // Zooming would never split this group.
                setChoices(members)
                return
            }

            const zoom = await source.getClusterExpansionZoom(clusterId)
            map.easeTo({
                center: [lng, lat],
                zoom,
                duration: prefersReducedMotion() ? 0 : 500,
            })
        }

        const onPointEnter = (event: MapLayerMouseEvent) => {
            const feature = event.features?.[0]
            if (feature?.geometry.type !== 'Point') return
            map.getCanvas().style.cursor = 'pointer'
            const [lng, lat] = feature.geometry.coordinates
            popup
                .setLngLat([lng, lat])
                .setText(String(feature.properties.name) || 'Unnamed station')
                .addTo(map)
        }
        const onPointLeave = () => {
            map.getCanvas().style.cursor = ''
            popup.remove()
        }
        const onGroupEnter = () => {
            map.getCanvas().style.cursor = 'pointer'
        }
        const onGroupLeave = () => {
            map.getCanvas().style.cursor = ''
        }

        map.on('style.load', () => {
            map.setProjection({ type: 'globe' })
            map.addSource(SOURCE, {
                type: 'geojson',
                data: toGeoJson([]),
                cluster: true,
                clusterRadius: 40,
                clusterMaxZoom: GROUP_MAX_ZOOM,
            })
            map.addLayer({
                id: GROUPS,
                type: 'circle',
                source: SOURCE,
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': '#2563eb',
                    'circle-opacity': 0.85,
                    'circle-stroke-color': '#bfdbfe',
                    'circle-stroke-width': 1,
                    // bigger bubbles for bigger groups
                    'circle-radius': [
                        'step',
                        ['get', 'point_count'],
                        14,
                        10,
                        18,
                        50,
                        24,
                    ],
                },
            })
            map.addLayer({
                id: GROUP_COUNTS,
                type: 'symbol',
                source: SOURCE,
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': ['get', 'point_count_abbreviated'],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': 12,
                },
                paint: { 'text-color': '#ffffff' },
            })
            map.addLayer({
                id: POINTS,
                type: 'circle',
                source: SOURCE,
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': pointColor(null),
                    'circle-radius': 6,
                    'circle-stroke-color': '#0f172a',
                    'circle-stroke-width': 1,
                },
            })

            map.on('click', POINTS, onPointClick)
            map.on('click', GROUPS, onGroupClick)
            map.on('mouseenter', POINTS, onPointEnter)
            map.on('mouseleave', POINTS, onPointLeave)
            map.on('mouseenter', GROUPS, onGroupEnter)
            map.on('mouseleave', GROUPS, onGroupLeave)
            setReady(true)
        })

        return () => {
            popup.remove()
            map.remove()
            mapRef.current = null
            setReady(false)
        }
    }, [])

    // New data: update the bubbles, keep the map.
    useEffect(() => {
        stationsRef.current = new Map(
            stations.map((station) => [station.id, station]),
        )
        if (!ready) return
        mapRef.current
            ?.getSource<GeoJSONSource>(SOURCE)
            ?.setData(toGeoJson(stations))
    }, [stations, ready])

    // Highlight the station that is playing.
    useEffect(() => {
        if (!ready) return
        mapRef.current?.setPaintProperty(
            POINTS,
            'circle-color',
            pointColor(playingId),
        )
    }, [playingId, ready])

    if (unsupported) {
        return (
            <Alert variant="info">This browser can't display the globe.</Alert>
        )
    }

    return (
        <div className="absolute inset-0">
            {/* Sized with h-full/w-full: MapLibre's own CSS sets this
                element's position, so inset-0 would not size it. */}
            <div ref={containerRef} className="h-full w-full rounded-lg" />
            {choices && (
                <div className="absolute inset-2 overflow-auto rounded-lg bg-surface/95 p-3">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-fg font-semibold">
                            {choices.length} stations here
                        </h4>
                        <Button
                            variant="ghost"
                            onClick={() => setChoices(null)}
                        >
                            Close
                        </Button>
                    </div>
                    <ul>
                        {choices.map((station) => (
                            <li key={station.id}>
                                <button
                                    type="button"
                                    className="w-full text-left p-2 rounded text-fg-secondary hover:bg-surface-raised"
                                    onClick={() => {
                                        setChoices(null)
                                        onPlay(station)
                                    }}
                                >
                                    {station.name || 'Unnamed station'}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
