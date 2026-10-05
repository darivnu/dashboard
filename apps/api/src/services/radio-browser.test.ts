import { beforeEach, describe, expect, test } from 'bun:test'
import { createTtlCache } from '../lib/cache'
import { aboutRoutes } from '../modules/about/about.routes'
import { createFakeRepo, noOAuthTokens } from '../modules/dashboard/dashboard.fakes'
import { createDashboardService } from '../modules/dashboard/dashboard.service'
import { createDataService } from '../modules/dashboard/data.service'
import type { CachedWidgetData } from '../modules/dashboard/data.service'
import { createFakeSubscriptionsRepo } from '../modules/subscriptions/subscriptions.fakes'
import { registerServices } from './register'
import { __resetRegistryForTests, registry } from './registry'
import type { HttpClient } from './types'
import { WidgetFetchError } from './types'

// Exercises radio_browser / station_map through the same two services the
// HTTP routes call (instance creation, then the data endpoint), with an
// in-memory repo and a stubbed HttpClient: no test reaches the network.

const ALICE = 'user-alice'
const USER_AGENT = 'Dashboard/0.1 (+https://github.com/darivnu/Dashboard)'

interface RecordedCall {
    url: URL
    headers: Headers
}

const SEARCH_PATH = '/json/stations/search'
const PINNED_ID = '79930fba-66b9-42cc-8b40-cf766176a38d'
const PINNED_PATH = `/json/stations/byuuid/${PINNED_ID}`

/**
 * Records every request and answers with whatever `reply` returns (or throws).
 * The lookup of the pinned station has its own reply, an empty list unless a
 * test sets one, so the other tests see only the station search.
 */
function createStubHttp() {
    const calls: RecordedCall[] = []
    let reply: (url: URL) => unknown = () => []
    let pinnedReply: () => unknown = () => []

    const http: HttpClient = {
        async json<T>(url: string, init?: RequestInit): Promise<T> {
            const parsed = new URL(url)
            calls.push({ url: parsed, headers: new Headers(init?.headers) })
            return (parsed.pathname === PINNED_PATH ? pinnedReply() : reply(parsed)) as T
        },
    }

    return {
        http,
        calls,
        replyWith(next: (url: URL) => unknown) {
            reply = next
        },
        replyPinnedWith(next: () => unknown) {
            pinnedReply = next
        },
    }
}

let stub: ReturnType<typeof createStubHttp>
let repo: ReturnType<typeof createFakeRepo>
let dashboard: ReturnType<typeof createDashboardService>
let data: ReturnType<typeof createDataService>

beforeEach(() => {
    __resetRegistryForTests()
    registerServices('development')

    stub = createStubHttp()
    repo = createFakeRepo()
    dashboard = createDashboardService(repo)
    data = createDataService({
        repo,
        subscriptions: createFakeSubscriptionsRepo(),
        http: stub.http,
        tokens: noOAuthTokens,
        cache: createTtlCache<CachedWidgetData>(),
    })
})

let sequence = 0

/** A well-formed upstream station row; each call gets a unique id and stream. */
function stationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    sequence += 1
    return {
        changeuuid: `change-${sequence}`,
        stationuuid: `uuid-${sequence}`,
        name: `Station ${sequence}`,
        url: `https://stream.example/${sequence}.pls`,
        url_resolved: `https://stream.example/${sequence}`,
        homepage: 'https://station.example/',
        favicon: 'https://station.example/icon.png',
        tags: 'jazz,blues',
        countrycode: 'FR',
        codec: 'MP3',
        bitrate: 128,
        hls: 0,
        votes: 42,
        clickcount: 1000,
        geo_lat: 48.8566,
        geo_long: 2.3522,
        ...overrides,
    }
}

function stationRows(count: number): Record<string, unknown>[] {
    return Array.from({ length: count }, () => stationRow())
}

interface StationOut {
    id: string
    name: string
    streamUrl: string
    favicon: string | null
    hls: boolean
    lat: number
    lng: number
}

async function createInstance(params: Record<string, unknown> = {}) {
    return dashboard.create(ALICE, { serviceId: 'radio_browser', widgetId: 'station_map', params })
}

async function fetchMap(params: Record<string, unknown> = {}) {
    const instance = await createInstance(params)
    return data.getInstanceData(ALICE, instance.id)
}

/** The stations of a successful fetch; fails the test with the code otherwise. */
async function fetchStations(params: Record<string, unknown> = {}): Promise<StationOut[]> {
    const result = await fetchMap(params)
    if (!result.ok) throw new Error(`expected ok: true, got code "${result.code}"`)
    return (result.data as { stations: StationOut[] }).stations
}

function callsTo(pathname: string): RecordedCall[] {
    return stub.calls.filter((call) => call.url.pathname === pathname)
}

/** The single station search made so far. */
function onlyCall(): RecordedCall {
    const searches = callsTo(SEARCH_PATH)
    expect(searches).toHaveLength(1)
    return searches[0]!
}

function queryOf(call: RecordedCall): Record<string, string> {
    return Object.fromEntries(call.url.searchParams)
}

describe('registration', () => {
    test.each(['production', 'development'])('with NODE_ENV=%j radio_browser has exactly the station_map widget', (nodeEnv) => {
        __resetRegistryForTests()
        registerServices(nodeEnv)

        const service = registry.getService('radio_browser')
        expect(service?.name).toBe('Radio Browser')
        expect(service?.auth).toEqual({ kind: 'none' })
        expect(service?.widgets.map((widget) => widget.id)).toEqual(['station_map'])
    })

    test('appears in /about.json in production', async () => {
        __resetRegistryForTests()
        registerServices('production')

        const response = await aboutRoutes.handle(new Request('http://localhost/about.json'))
        const body = await response.json()
        const radio = body.server.services.find((service: { name: string }) => service.name === 'Radio Browser')

        expect(radio.widgets).toEqual([
            {
                name: 'Station map',
                description: expect.any(String),
                params: [{ name: 'limit', type: 'integer' }],
            },
        ])
    })
})

describe('request', () => {
    test('targets the station search on all.api.radio-browser.info with the User-Agent and fixed flags', async () => {
        await fetchMap()

        const call = onlyCall()
        expect(call.url.origin).toBe('https://all.api.radio-browser.info')
        expect(call.url.pathname).toBe('/json/stations/search')
        expect(call.headers.get('user-agent')).toBe(USER_AGENT)
        expect(queryOf(call)).toEqual({
            has_geo_info: 'true',
            is_https: 'true',
            hidebroken: 'true',
            order: 'clickcount',
            reverse: 'true',
            limit: '210',
        })
    })

    test.each([1, 999])('limit %j is a bound: accepted as is, and limit + 10 is requested', async (limit) => {
        stub.replyWith(() => stationRows(1019))

        const stations = await fetchStations({ limit })

        expect(queryOf(onlyCall()).limit).toBe(String(limit + 10))
        expect(stations).toHaveLength(limit)
    })
})

describe('limit bounds', () => {
    test.each([0, 1000, '9999'])('creating an instance with limit %j is 400 INVALID_PARAMS', async (limit) => {
        await expect(createInstance({ limit })).rejects.toMatchObject({ status: 400, code: 'INVALID_PARAMS' })

        expect(repo.rows).toHaveLength(0)
        expect(stub.calls).toHaveLength(0)
    })

    test.each([0, 1000])('updating an instance to limit %j is 400 INVALID_PARAMS and keeps the stored value', async (limit) => {
        const instance = await createInstance({ limit: 50 })

        const attempt = dashboard.update(ALICE, instance.id, { params: { limit } })

        await expect(attempt).rejects.toMatchObject({ status: 400, code: 'INVALID_PARAMS' })
        expect(repo.rows[0]!.params).toEqual({ limit: 50 })
    })

    test.each([1, 999])('updating an instance to limit %j is accepted', async (limit) => {
        const instance = await createInstance({ limit: 50 })

        const updated = await dashboard.update(ALICE, instance.id, { params: { limit } })

        expect(updated.params).toEqual({ limit })
    })

    test('an instance stored with an out-of-range limit is invalid_config, with no upstream request', async () => {
        // Straight into the repo, bypassing validation: this is a row saved
        // before the bounds existed.
        const stored = await repo.insert({
            userId: ALICE,
            serviceId: 'radio_browser',
            widgetId: 'station_map',
            title: null,
            params: { limit: 9999 },
            refreshSeconds: 600,
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            enabled: true,
        })

        expect(await data.getInstanceData(ALICE, stored.id)).toEqual({ ok: false, code: 'invalid_config' })
        expect(stub.calls).toHaveLength(0)
    })

    test('editing such an instance back into the range makes it work again', async () => {
        stub.replyWith(() => stationRows(20))
        const stored = await repo.insert({
            userId: ALICE,
            serviceId: 'radio_browser',
            widgetId: 'station_map',
            title: null,
            params: { limit: 9999 },
            refreshSeconds: 600,
            x: 0,
            y: 0,
            w: 4,
            h: 3,
            enabled: true,
        })

        await dashboard.update(ALICE, stored.id, { params: { limit: 5 } })
        const result = await data.getInstanceData(ALICE, stored.id)

        expect(result.ok).toBe(true)
        expect(queryOf(onlyCall()).limit).toBe('15')
    })
})

describe('station cleaning', () => {
    test('a well-formed row becomes exactly the documented fields', async () => {
        stub.replyWith(() => [
            stationRow({ stationuuid: 'abc', name: 'Jazz FM', url_resolved: 'https://jazz.example/live', hls: 1 }),
        ])

        expect(await fetchStations()).toEqual([
            {
                id: 'abc',
                name: 'Jazz FM',
                streamUrl: 'https://jazz.example/live',
                favicon: 'https://station.example/icon.png',
                hls: true,
                lat: 48.8566,
                lng: 2.3522,
            },
        ])
    })

    test('names are trimmed', async () => {
        stub.replyWith(() => [stationRow({ name: '  Jazz FM \n' })])

        const [station] = await fetchStations()

        expect(station?.name).toBe('Jazz FM')
    })

    test.each([
        ['empty', ''],
        ['http://', 'http://station.example/icon.png'],
        ['not a URL', 'data:image/png;base64,AAAA'],
    ])('an %s favicon becomes null', async (_label, favicon) => {
        stub.replyWith(() => [stationRow({ favicon })])

        const [station] = await fetchStations()

        expect(station?.favicon).toBeNull()
    })

    test('hls is a boolean', async () => {
        stub.replyWith(() => [stationRow({ hls: 1 }), stationRow({ hls: 0 })])

        const stations = await fetchStations()

        expect(stations.map((station) => station.hls)).toEqual([true, false])
    })

    test('coordinates at the range bounds are kept', async () => {
        stub.replyWith(() => [stationRow({ geo_lat: -90, geo_long: 180 })])

        const [station] = await fetchStations()

        expect(station).toMatchObject({ lat: -90, lng: 180 })
    })

    test.each([
        ['no stationuuid', { stationuuid: '' }],
        ['a missing stationuuid', { stationuuid: undefined }],
        ['an http:// stream', { url_resolved: 'http://stream.example/plain' }],
        ['no stream', { url_resolved: '' }],
        ['no coordinates', { geo_lat: null, geo_long: null }],
        ['only a latitude', { geo_long: null }],
        ['string coordinates', { geo_lat: '48.8', geo_long: '2.3' }],
        ['a latitude above 90', { geo_lat: 91 }],
        ['a longitude below -180', { geo_long: -181 }],
    ])('a row with %s is dropped', async (_label, overrides) => {
        const kept = stationRow()
        stub.replyWith(() => [stationRow(overrides), kept])

        const stations = await fetchStations()

        expect(stations.map((station) => station.id)).toEqual([kept.stationuuid as string])
    })

    test('rows that are not objects are dropped', async () => {
        const kept = stationRow()
        stub.replyWith(() => [null, 'not a row', 42, kept])

        const stations = await fetchStations()

        expect(stations.map((station) => station.id)).toEqual([kept.stationuuid as string])
    })

    test('duplicates by streamUrl keep the first (most listened) row', async () => {
        const popular = stationRow({ url_resolved: 'https://same.example/live', clickcount: 900 })
        const copy = stationRow({ url_resolved: 'https://same.example/live', clickcount: 10 })
        stub.replyWith(() => [popular, copy])

        const stations = await fetchStations()

        expect(stations.map((station) => station.id)).toEqual([popular.stationuuid as string])
    })

    test('the extra rows refill the list to exactly `limit` after drops and duplicates', async () => {
        const rows = stationRows(8)
        rows.splice(1, 0, { ...stationRow(), url_resolved: rows[0]!.url_resolved })
        rows.splice(3, 0, stationRow({ geo_lat: null }))
        rows.splice(5, 0, stationRow({ url_resolved: 'http://plain.example/live' }))
        stub.replyWith(() => rows)

        const stations = await fetchStations({ limit: 5 })

        expect(stations).toHaveLength(5)
        expect(new Set(stations.map((station) => station.streamUrl)).size).toBe(5)
    })

    test('every returned station is playable over https and placeable on the map', async () => {
        stub.replyWith(() => [
            stationRow(),
            stationRow({ url_resolved: 'http://plain.example/live' }),
            stationRow({ favicon: 'http://plain.example/icon.png' }),
            stationRow({ geo_lat: 200 }),
        ])

        const stations = await fetchStations()

        expect(stations).toHaveLength(2)
        for (const station of stations) {
            expect(station.streamUrl.startsWith('https://')).toBe(true)
            expect(station.favicon === null || station.favicon.startsWith('https://')).toBe(true)
            expect(Math.abs(station.lat)).toBeLessThanOrEqual(90)
            expect(Math.abs(station.lng)).toBeLessThanOrEqual(180)
        }
    })
})

describe('widget output', () => {
    test('returns exactly { stations }', async () => {
        stub.replyWith(() => stationRows(3))

        const result = await fetchMap()

        expect(result.ok).toBe(true)
        expect(result.ok && Object.keys(result.data as object)).toEqual(['stations'])
    })

    test('no usable row returns stations: []', async () => {
        stub.replyWith(() => [])

        expect(await fetchStations()).toEqual([])
    })
})

describe('upstream failures', () => {
    test.each([
        ['an object', { error: 'nope' }],
        ['null', null],
        ['a string', 'not an array'],
    ])('a body that is %s is upstream_error', async (_label, body) => {
        stub.replyWith(() => body)

        expect(await fetchMap()).toEqual({ ok: false, code: 'upstream_error' })
    })

    test('an upstream 429 (rate_limited from ctx.http) is passed through', async () => {
        stub.replyWith(() => {
            throw new WidgetFetchError('rate_limited', 'Request failed with status 429')
        })

        expect(await fetchMap()).toEqual({ ok: false, code: 'rate_limited' })
    })
})

describe('caching', () => {
    test('a second fetch within refresh.min makes no upstream request', async () => {
        stub.replyWith(() => stationRows(3))
        const instance = await createInstance()

        const first = await data.getInstanceData(ALICE, instance.id)
        const second = await data.getInstanceData(ALICE, instance.id)

        expect(first.ok).toBe(true)
        expect(second).toEqual(first)
        expect(callsTo(SEARCH_PATH)).toHaveLength(1)
        expect(callsTo(PINNED_PATH)).toHaveLength(1)
    })
})

describe('pinned station', () => {
    // The directory entry as it is today: playable, but without coordinates
    // and far too few clicks to rank.
    function pinnedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            stationuuid: PINNED_ID,
            name: 'Spinning Seal FM',
            url: 'https://stream.zeno.fm/9q3ez3k3fchvv',
            url_resolved: 'https://stream.zeno.fm/9q3ez3k3fchvv',
            favicon: '',
            hls: 0,
            clickcount: 2,
            geo_lat: null,
            geo_long: null,
            ...overrides,
        }
    }

    test('is looked up by its id, with the User-Agent', async () => {
        await fetchMap()

        const lookups = callsTo(PINNED_PATH)
        expect(lookups).toHaveLength(1)
        expect(lookups[0]!.url.origin).toBe('https://all.api.radio-browser.info')
        expect(lookups[0]!.url.search).toBe('')
        expect(lookups[0]!.headers.get('user-agent')).toBe(USER_AGENT)
    })

    test('is added after the most listened stations, on top of `limit`, at its fixed position', async () => {
        stub.replyWith(() => stationRows(20))
        stub.replyPinnedWith(() => [pinnedRow()])

        const stations = await fetchStations({ limit: 3 })

        expect(stations).toHaveLength(4)
        expect(stations[3]).toEqual({
            id: PINNED_ID,
            name: 'Spinning Seal FM',
            streamUrl: 'https://stream.zeno.fm/9q3ez3k3fchvv',
            favicon: null,
            hls: false,
            lat: 40.423194,
            lng: -3.710889,
        })
    })

    test('keeps its fixed position even if the directory gains coordinates', async () => {
        stub.replyPinnedWith(() => [pinnedRow({ geo_lat: 59.33, geo_long: 18.07 })])

        const [pinned] = await fetchStations()

        expect(pinned).toMatchObject({ lat: 40.423194, lng: -3.710889 })
    })

    test('is the only station when the search returns nothing usable', async () => {
        stub.replyPinnedWith(() => [pinnedRow()])

        expect((await fetchStations()).map((station) => station.id)).toEqual([PINNED_ID])
    })

    test.each([
        ['is not found (empty list)', () => []],
        ['is an unexpected body', () => ({ error: 'nope' })],
        ['is not an object', () => ['nope']],
        ['has no https stream', () => [pinnedRow({ url_resolved: 'http://stream.zeno.fm/9q3ez3k3fchvv' })]],
        ['has no id', () => [pinnedRow({ stationuuid: '' })]],
    ])('is left out when the lookup %s', async (_label, reply) => {
        stub.replyWith(() => stationRows(3))
        stub.replyPinnedWith(reply)

        const stations = await fetchStations()

        expect(stations).toHaveLength(3)
        expect(stations.map((station) => station.id)).not.toContain(PINNED_ID)
    })

    test.each([
        ['an upstream error', new WidgetFetchError('upstream_error', 'Request failed with status 500')],
        ['a rate limit', new WidgetFetchError('rate_limited', 'Request failed with status 429')],
        ['an unexpected exception', new Error('boom')],
    ])('a lookup failing with %s does not fail the widget', async (_label, error) => {
        stub.replyWith(() => stationRows(3))
        stub.replyPinnedWith(() => {
            throw error
        })

        const result = await fetchMap()

        expect(result.ok).toBe(true)
        expect(result.ok && (result.data as { stations: StationOut[] }).stations).toHaveLength(3)
    })

    test('a failing search still fails the widget, whatever the lookup returns', async () => {
        stub.replyWith(() => {
            throw new WidgetFetchError('rate_limited', 'Request failed with status 429')
        })
        stub.replyPinnedWith(() => [pinnedRow()])

        expect(await fetchMap()).toEqual({ ok: false, code: 'rate_limited' })
    })

    test('is not repeated when the search already returned it', async () => {
        const ranked = stationRow({ stationuuid: PINNED_ID, name: 'Spinning Seal FM' })
        stub.replyWith(() => [stationRow(), ranked, stationRow()])
        stub.replyPinnedWith(() => [pinnedRow()])

        const stations = await fetchStations()

        expect(stations).toHaveLength(3)
        expect(stations.filter((station) => station.id === PINNED_ID)).toHaveLength(1)
    })

    test('is not added when another entry of the search already has its stream', async () => {
        const sameStream = stationRow({ url_resolved: 'https://stream.zeno.fm/9q3ez3k3fchvv' })
        stub.replyWith(() => [stationRow(), sameStream])
        stub.replyPinnedWith(() => [pinnedRow()])

        const stations = await fetchStations()

        expect(stations).toHaveLength(2)
        expect(stations.map((station) => station.id)).not.toContain(PINNED_ID)
    })
})
