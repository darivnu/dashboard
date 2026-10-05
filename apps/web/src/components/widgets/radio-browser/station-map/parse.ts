export type Station = {
    id: string
    name: string
    streamUrl: string
    favicon: string | null
    /** true = HLS stream, which a plain audio element only plays in some browsers */
    hls: boolean
    lat: number
    lng: number
}

export type StationMapData = {
    stations: Station[]
}

function fail(): never {
    throw new Error('Unexpected station map data')
}

// NaN fails this too: a comparison with NaN is always false.
function isCoordinate(value: unknown, limit: number): value is number {
    return typeof value === 'number' && Math.abs(value) <= limit
}

function parseStation(raw: unknown): Station {
    if (typeof raw !== 'object' || raw === null) return fail()
    const { id, name, streamUrl, favicon, hls, lat, lng } = raw as Record<
        string,
        unknown
    >
    if (typeof id !== 'string' || id === '') return fail()
    if (typeof name !== 'string') return fail()
    if (typeof streamUrl !== 'string' || streamUrl === '') return fail()
    if (favicon !== null && typeof favicon !== 'string') return fail()
    if (typeof hls !== 'boolean') return fail()
    if (!isCoordinate(lat, 90) || !isCoordinate(lng, 180)) return fail()
    return { id, name, streamUrl, favicon, hls, lat, lng }
}

export function parseStationMap(raw: unknown): StationMapData {
    if (typeof raw !== 'object' || raw === null) return fail()
    const { stations } = raw as Record<string, unknown>
    if (!Array.isArray(stations)) return fail()
    return { stations: stations.map(parseStation) }
}
