import { beforeEach, describe, expect, test } from 'bun:test'
import { createTtlCache } from '../lib/cache'
import { aboutRoutes } from '../modules/about/about.routes'
import { createFakeRepo } from '../modules/dashboard/dashboard.fakes'
import { createDashboardService } from '../modules/dashboard/dashboard.service'
import { createDataService } from '../modules/dashboard/data.service'
import type { CachedWidgetData } from '../modules/dashboard/data.service'
import { createFakeSubscriptionsRepo } from '../modules/subscriptions/subscriptions.fakes'
import { createFakeProvider, fakeCredentials } from './oauth/providers.fakes'
import { createTokenManager } from './oauth/tokens'
import { registerServices } from './register'
import { __resetRegistryForTests, registry } from './registry'
import type { HttpClient } from './types'
import { WidgetFetchError } from './types'

// Exercises spotify / recently_played through the same two services the HTTP
// routes call (instance creation, then the data endpoint), with in-memory
// repos, a stored fake token and a stubbed HttpClient: no test reaches the
// network or Spotify's login page.

const ALICE = 'user-alice'
const TOKEN = 'BQD_alice_access_token'

/** Records every request and answers with whatever `reply` returns (or throws). */
function createStubHttp() {
    const calls: { url: URL; init: RequestInit | undefined }[] = []
    let reply: () => unknown = () => ({ items: [] })

    const http: HttpClient = {
        async json<T>(url: string, init?: RequestInit): Promise<T> {
            calls.push({ url: new URL(url), init })
            return reply() as T
        },
        async text() {
            throw new Error('recently_played only reads JSON')
        },
    }

    return {
        http,
        calls,
        replyWith(next: () => unknown) {
            reply = next
        },
    }
}

let stub: ReturnType<typeof createStubHttp>
let subscriptions: ReturnType<typeof createFakeSubscriptionsRepo>
let dashboard: ReturnType<typeof createDashboardService>
let data: ReturnType<typeof createDataService>

beforeEach(() => {
    __resetRegistryForTests()
    registerServices('development')

    stub = createStubHttp()
    const repo = createFakeRepo()
    subscriptions = createFakeSubscriptionsRepo()
    dashboard = createDashboardService(repo)
    data = createDataService({
        repo,
        subscriptions,
        http: stub.http,
        //the stored token never expires in these tests, so the provider is never asked to refresh it
        tokens: createTokenManager({ repo: subscriptions, getProvider: () => createFakeProvider({ id: 'spotify' }) }),
        cache: createTtlCache<CachedWidgetData>(),
    })
})

/** What clicking Connect and accepting on Spotify leaves behind: a stored token for Alice. */
async function connect() {
    await subscriptions.upsert(ALICE, 'spotify', { ...fakeCredentials({ accessToken: TOKEN }) })
}

async function fetchWidget(params: Record<string, unknown> = {}) {
    const instance = await dashboard.create(ALICE, { serviceId: 'spotify', widgetId: 'recently_played', params })
    return data.getInstanceData(ALICE, instance.id)
}

interface TrackOut {
    title: string
    artists: string[]
    album: string
    cover: string | null
    url: string | null
    playedAt: string
}

/** The tracks of a successful fetch for a connected user; fails the test with the code otherwise. */
async function fetchTracks(items: unknown[]): Promise<TrackOut[]> {
    await connect()
    stub.replyWith(() => ({ items }))
    const result = await fetchWidget()
    if (!result.ok) throw new Error(`expected ok: true, got code "${result.code}"`)
    return (result.data as { tracks: TrackOut[] }).tracks
}

/** A well-formed upstream play, as Spotify sends it (with fields the widget never uses). */
function play(overrides: Record<string, unknown> = {}, track: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        played_at: '2026-10-09T08:15:30.123Z',
        context: { type: 'album', uri: 'spotify:album:2noRn2Aes5aoNVsU6iWThc' },
        track: {
            id: '3n3Ppam7vgaVa1iaRUc9Lp',
            name: 'Mr. Brightside',
            duration_ms: 222973,
            artists: [{ id: '0C0XlULifJtAgn6ZNCW2eu', name: 'The Killers' }],
            album: {
                name: 'Hot Fuss',
                images: [
                    { url: 'https://i.scdn.co/image/large', width: 640, height: 640 },
                    { url: 'https://i.scdn.co/image/medium', width: 300, height: 300 },
                    { url: 'https://i.scdn.co/image/small', width: 64, height: 64 },
                ],
            },
            external_urls: { spotify: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp' },
            ...track,
        },
        ...overrides,
    }
}

/** The only track returned for this one upstream play. */
async function cleaned(overrides: Record<string, unknown> = {}, track: Record<string, unknown> = {}): Promise<TrackOut> {
    const tracks = await fetchTracks([play(overrides, track)])
    expect(tracks).toHaveLength(1)
    return tracks[0]!
}

describe('registration', () => {
    test.each(['production', 'development'])('with NODE_ENV=%j spotify has exactly the recently_played widget', (nodeEnv) => {
        __resetRegistryForTests()
        registerServices(nodeEnv)

        const service = registry.getService('spotify')
        expect(service?.name).toBe('Spotify')
        expect(service?.auth).toEqual({ kind: 'oauth2', provider: 'spotify', scopes: ['user-read-recently-played'] })
        expect(service?.widgets.map((widget) => widget.id)).toEqual(['recently_played'])
    })

    test('the limit setting is an integer from 1 to 20 that defaults to 5', () => {
        expect(registry.getWidget('spotify', 'recently_played')?.params).toEqual([
            { name: 'limit', label: 'How many to show', type: 'integer', min: 1, max: 20, default: 5 },
        ])
    })

    test('refreshes every five minutes by default and never faster than every minute', () => {
        expect(registry.getWidget('spotify', 'recently_played')?.refresh).toEqual({ default: 300, min: 60 })
    })

    test('appears in /about.json in production', async () => {
        __resetRegistryForTests()
        registerServices('production')

        const response = await aboutRoutes.handle(new Request('http://localhost/about.json'))
        const body = await response.json()
        const spotify = body.server.services.find((service: { name: string }) => service.name === 'Spotify')

        expect(spotify.widgets).toEqual([
            {
                name: 'Recently played',
                description: expect.any(String),
                params: [{ name: 'limit', type: 'integer' }],
            },
        ])
    })
})

describe('request', () => {
    test('asks Spotify for the last plays with the default limit and the Bearer header', async () => {
        await connect()

        await fetchWidget()

        expect(stub.calls).toHaveLength(1)
        const { url, init } = stub.calls[0]!
        expect(url.origin + url.pathname).toBe('https://api.spotify.com/v1/me/player/recently-played')
        expect([...url.searchParams.entries()]).toEqual([['limit', '5']])
        expect(init?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` })
    })

    test('the configured limit is the one sent', async () => {
        await connect()

        await fetchWidget({ limit: 12 })

        expect(stub.calls[0]!.url.searchParams.get('limit')).toBe('12')
    })

    test('the token is nowhere but the Authorization header', async () => {
        await connect()
        stub.replyWith(() => ({ items: [play()] }))

        const result = await fetchWidget()

        expect(stub.calls[0]!.url.toString()).not.toContain(TOKEN)
        expect(JSON.stringify(result)).not.toContain(TOKEN)
    })
})

describe('limit bounds', () => {
    test.each([0, 21, -3])('creating an instance with limit %j is 400 INVALID_PARAMS and asks Spotify nothing', async (limit) => {
        await connect()

        await expect(fetchWidget({ limit })).rejects.toMatchObject({ status: 400, code: 'INVALID_PARAMS' })

        expect(stub.calls).toHaveLength(0)
    })

    test.each([1, 20])('limit %j is accepted', async (limit) => {
        await connect()

        expect(await fetchWidget({ limit })).toMatchObject({ ok: true })
    })
})

describe('without a usable connection', () => {
    test('without a subscription the data endpoint answers needs_reauth and asks Spotify nothing', async () => {
        expect(await fetchWidget()).toEqual({ ok: false, code: 'needs_reauth' })
        expect(stub.calls).toHaveLength(0)
    })

    test('fetch itself refuses to run without getAccessToken', async () => {
        const widget = registry.getWidget('spotify', 'recently_played')!

        const error = await widget.fetch({ http: stub.http }, { limit: 5 }).catch((e: unknown) => e)

        expect(error).toBeInstanceOf(WidgetFetchError)
        expect((error as WidgetFetchError).code).toBe('needs_reauth')
        expect(stub.calls).toHaveLength(0)
    })

    //401 (token revoked) and 403 (account not on the app's allow-list) both reach us as needs_reauth from the http client
    test('a needs_reauth failure of the request flags the subscription', async () => {
        await connect()
        stub.replyWith(() => {
            throw new WidgetFetchError('needs_reauth', 'stubbed 403')
        })

        expect(await fetchWidget()).toEqual({ ok: false, code: 'needs_reauth' })
        expect(subscriptions.rows[0]!.status).toBe('needs_reauth')
    })

    test.each(['rate_limited', 'upstream_error'] as const)('a %s failure of the request is passed through', async (code) => {
        await connect()
        stub.replyWith(() => {
            throw new WidgetFetchError(code, 'stubbed failure')
        })

        expect(await fetchWidget()).toEqual({ ok: false, code })
    })
})

describe('answer shape', () => {
    test('an empty items list is a valid answer with no tracks', async () => {
        await connect()
        stub.replyWith(() => ({ items: [] }))

        expect(await fetchWidget()).toMatchObject({ ok: true, data: { tracks: [] } })
    })

    test.each([
        ['null', null],
        ['a string', 'nope'],
        ['a list', [play()]],
        ['an object without items', { next: null }],
        ['items that is not a list', { items: 'many' }],
        ['an error object', { error: { status: 500, message: 'Server error' } }],
    ])('%s is upstream_error', async (_label, body) => {
        await connect()
        stub.replyWith(() => body)

        expect(await fetchWidget()).toEqual({ ok: false, code: 'upstream_error' })
    })

    test.each([
        ['is not an object', 'a play'],
        ['is null', null],
        ['has no track', play({ track: undefined })],
        ['has a null track', play({ track: null })],
        ['has no track name', play({}, { name: undefined })],
        ['has an empty track name', play({}, { name: '' })],
        ['has a track name that is not text', play({}, { name: 42 })],
        ['has no played_at', play({ played_at: undefined })],
        ['has an empty played_at', play({ played_at: '' })],
    ])('an item that %s is upstream_error', async (_label, item) => {
        await connect()
        stub.replyWith(() => ({ items: [play(), item] }))

        expect(await fetchWidget()).toEqual({ ok: false, code: 'upstream_error' })
    })

    test('the error for a malformed answer does not contain the token', async () => {
        const widget = registry.getWidget('spotify', 'recently_played')!
        stub.replyWith(() => ({ items: [{ played_at: TOKEN }] }))

        const error = await widget
            .fetch({ http: stub.http, getAccessToken: async () => TOKEN }, { limit: 5 })
            .catch((e: unknown) => e)

        expect(error).toBeInstanceOf(WidgetFetchError)
        expect((error as WidgetFetchError).message).not.toContain(TOKEN)
    })
})

describe('track output', () => {
    test('a track has exactly the six documented fields', async () => {
        expect(await cleaned()).toEqual({
            title: 'Mr. Brightside',
            artists: ['The Killers'],
            album: 'Hot Fuss',
            cover: 'https://i.scdn.co/image/small',
            url: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp',
            playedAt: '2026-10-09T08:15:30.123Z',
        })
    })

    test('tracks keep the order Spotify sent, most recent first', async () => {
        const tracks = await fetchTracks([
            play({ played_at: '2026-10-09T08:15:30.123Z' }, { name: 'Third' }),
            play({ played_at: '2026-10-09T08:11:00.000Z' }, { name: 'Second' }),
            play({ played_at: '2026-10-09T08:07:00.000Z' }, { name: 'First' }),
        ])

        expect(tracks.map((track) => track.title)).toEqual(['Third', 'Second', 'First'])
    })

    test('the same track played twice appears twice', async () => {
        const tracks = await fetchTracks([
            play({ played_at: '2026-10-09T08:15:30.123Z' }),
            play({ played_at: '2026-10-09T08:11:00.000Z' }),
        ])

        expect(tracks.map((track) => track.playedAt)).toEqual(['2026-10-09T08:15:30.123Z', '2026-10-09T08:11:00.000Z'])
    })
})

describe('artists', () => {
    test('every artist name is kept, in order', async () => {
        const track = await cleaned({}, { artists: [{ name: 'Daft Punk' }, { name: 'Pharrell Williams' }, { name: 'Nile Rodgers' }] })

        expect(track.artists).toEqual(['Daft Punk', 'Pharrell Williams', 'Nile Rodgers'])
    })

    test.each([
        ['missing', undefined],
        ['not a list', 'The Killers'],
        ['empty', []],
    ])('an artists field that is %s gives an empty list', async (_label, artists) => {
        expect((await cleaned({}, { artists })).artists).toEqual([])
    })

    test('entries without a usable name are skipped', async () => {
        const track = await cleaned({}, { artists: [null, {}, { name: '' }, { name: 7 }, { name: 'The Killers' }] })

        expect(track.artists).toEqual(['The Killers'])
    })
})

describe('album', () => {
    test.each([
        ['there is no album', undefined],
        ['the album has no name', { images: [] }],
    ])('is an empty string when %s', async (_label, album) => {
        expect((await cleaned({}, { album })).album).toBe('')
    })
})

describe('cover image', () => {
    function withImages(images: unknown) {
        return cleaned({}, { album: { name: 'Hot Fuss', images } })
    }

    test('is the smallest image at least 64 px wide, whatever the order', async () => {
        const track = await withImages([
            { url: 'https://i.scdn.co/image/300', width: 300 },
            { url: 'https://i.scdn.co/image/32', width: 32 },
            { url: 'https://i.scdn.co/image/160', width: 160 },
            { url: 'https://i.scdn.co/image/640', width: 640 },
        ])

        expect(track.cover).toBe('https://i.scdn.co/image/160')
    })

    test.each([
        ['there are no images', []],
        ['images is missing', undefined],
        ['images is not a list', 'https://i.scdn.co/image/small'],
        ['every image is narrower than 64 px', [{ url: 'https://i.scdn.co/image/32', width: 32 }]],
        ['no image says how wide it is', [{ url: 'https://i.scdn.co/image/unknown', width: null }]],
        ['the only image has no address', [{ width: 300 }]],
        ['the only image is not served over https', [{ url: 'http://i.scdn.co/image/300', width: 300 }]],
    ])('is null when %s', async (_label, images) => {
        expect((await withImages(images)).cover).toBeNull()
    })

    test('an unusable image is passed over for the next one', async () => {
        const track = await withImages([
            null,
            { url: 'javascript:alert(1)', width: 64 },
            { url: 'https://i.scdn.co/image/300', width: 300 },
        ])

        expect(track.cover).toBe('https://i.scdn.co/image/300')
    })
})

describe('track link', () => {
    test.each([
        ['there is no external_urls', undefined],
        ['external_urls has no spotify entry', {}],
        ['the address is not served over https', { spotify: 'javascript:alert(1)' }],
    ])('is null when %s', async (_label, external_urls) => {
        expect((await cleaned({}, { external_urls })).url).toBeNull()
    })
})

describe('caching', () => {
    test('a second request for the same widget is served from cache without asking Spotify', async () => {
        await connect()
        const instance = await dashboard.create(ALICE, { serviceId: 'spotify', widgetId: 'recently_played', params: {} })

        const first = await data.getInstanceData(ALICE, instance.id)
        const second = await data.getInstanceData(ALICE, instance.id)

        expect(stub.calls).toHaveLength(1)
        expect(second).toEqual(first)
    })

    test('another user with the same settings gets their own request, never the first user\'s tracks', async () => {
        await connect()
        await subscriptions.upsert('user-bob', 'spotify', { ...fakeCredentials({ accessToken: 'BQD_bob_access_token' }) })
        const bobs = await dashboard.create('user-bob', { serviceId: 'spotify', widgetId: 'recently_played', params: {} })

        await fetchWidget()
        await data.getInstanceData('user-bob', bobs.id)

        expect(stub.calls.map((call) => call.init?.headers)).toEqual([
            { Authorization: `Bearer ${TOKEN}` },
            { Authorization: 'Bearer BQD_bob_access_token' },
        ])
    })
})
