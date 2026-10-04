import { vi } from 'vitest'

// A stand-in for maplibre-gl in tests. It draws nothing: it records what the
// widget asked of the map and lets a test fire the map's events. Use it with
//
//     vi.mock('maplibre-gl', async () => (await import('./fakeMaplibre')).maplibreModule)

type Handler = (event: unknown) => unknown

type Feature = {
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: Record<string, unknown>
}

export class FakeSource {
    data: unknown
    /** cluster id -> the features inside it */
    leaves = new Map<number, Feature[]>()
    /** cluster id -> the zoom at which it splits */
    expansionZoom = new Map<number, number>()

    setData = vi.fn((data: unknown) => {
        this.data = data
        return Promise.resolve()
    })
    getClusterLeaves = vi.fn((clusterId: number) =>
        Promise.resolve(this.leaves.get(clusterId) ?? []),
    )
    getClusterExpansionZoom = vi.fn((clusterId: number) =>
        Promise.resolve(this.expansionZoom.get(clusterId) ?? 0),
    )

    constructor(data: unknown) {
        this.data = data
    }
}

export class FakeMap {
    static instances: FakeMap[] = []

    options: Record<string, unknown>
    sources = new Map<string, FakeSource>()
    sourceOptions = new Map<string, Record<string, unknown>>()
    layers: { id: string }[] = []
    canvas = { style: { cursor: '' } }
    private handlers = new Map<string, Handler[]>()

    setProjection = vi.fn()
    setPaintProperty = vi.fn()
    easeTo = vi.fn()
    remove = vi.fn()

    constructor(options: Record<string, unknown>) {
        this.options = options
        FakeMap.instances.push(this)
    }

    on(type: string, layerOrHandler: string | Handler, handler?: Handler) {
        const key =
            typeof layerOrHandler === 'string'
                ? `${type}:${layerOrHandler}`
                : type
        const fn = typeof layerOrHandler === 'string' ? handler : layerOrHandler
        if (fn) this.handlers.set(key, [...(this.handlers.get(key) ?? []), fn])
        return this
    }

    addSource(id: string, options: { data: unknown }) {
        this.sources.set(id, new FakeSource(options.data))
        this.sourceOptions.set(id, options)
    }

    getSource(id: string) {
        return this.sources.get(id)
    }

    addLayer(layer: { id: string }) {
        this.layers.push(layer)
    }

    getCanvas() {
        return this.canvas
    }

    /** Fire a map event, e.g. fire('style.load') or fire('click', 'station-points', { features }). */
    async fire(type: string, layer?: string, event: unknown = {}) {
        const key = layer ? `${type}:${layer}` : type
        for (const handler of this.handlers.get(key) ?? []) {
            await handler(event)
        }
    }

    static get last() {
        const last = FakeMap.instances.at(-1)
        if (!last) throw new Error('no map was created')
        return last
    }
}

export class FakePopup {
    static instances: FakePopup[] = []

    text = ''
    lngLat: unknown = null
    shown = false

    constructor() {
        FakePopup.instances.push(this)
    }

    setLngLat(lngLat: unknown) {
        this.lngLat = lngLat
        return this
    }

    setText(text: string) {
        this.text = text
        return this
    }

    addTo() {
        this.shown = true
        return this
    }

    remove() {
        this.shown = false
        return this
    }
}

export function resetFakeMaplibre() {
    FakeMap.instances = []
    FakePopup.instances = []
}

/** Every address given to setWorkerUrl. Kept in a plain list because the
 * call happens once, when Globe.tsx is first imported, before any test. */
export const workerUrls: string[] = []

export const maplibreModule = {
    Map: FakeMap,
    Popup: FakePopup,
    setWorkerUrl: (url: string) => {
        workerUrls.push(url)
    },
}

/** A feature as the map hands it to a click handler. */
export function pointFeature(
    properties: Record<string, unknown>,
    coordinates: [number, number] = [0, 0],
): Feature {
    return { geometry: { type: 'Point', coordinates }, properties }
}
