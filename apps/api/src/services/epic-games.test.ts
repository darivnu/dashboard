import { beforeEach, describe, expect, test } from 'bun:test'
import { createTtlCache } from '../lib/cache'
import { aboutRoutes } from '../modules/about/about.routes'
import { createFakeRepo } from '../modules/dashboard/dashboard.fakes'
import { createDashboardService } from '../modules/dashboard/dashboard.service'
import { createDataService } from '../modules/dashboard/data.service'
import type { CachedWidgetData } from '../modules/dashboard/data.service'
import { createFakeSubscriptionsRepo } from '../modules/subscriptions/subscriptions.fakes'
import { registerServices } from './register'
import { __resetRegistryForTests, registry } from './registry'
import type { HttpClient } from './types'
import { WidgetFetchError } from './types'

// Exercises epic_games / free_games through the same two services the HTTP
// routes call (instance creation, then the data endpoint), with an in-memory
// repo and a stubbed HttpClient: no test reaches the network.

const ALICE = 'user-alice'

/** The upstream body with the given games in the place the store puts them. */
function bodyWith(elements: unknown): unknown {
    return { data: { Catalog: { searchStore: { elements } } } }
}

/** Records every request and answers with whatever `reply` returns (or throws). */
function createStubHttp() {
    const calls: URL[] = []
    let reply: () => unknown = () => bodyWith([])

    const http: HttpClient = {
        async json<T>(url: string): Promise<T> {
            calls.push(new URL(url))
            return reply() as T
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
let dashboard: ReturnType<typeof createDashboardService>
let data: ReturnType<typeof createDataService>

beforeEach(() => {
    __resetRegistryForTests()
    registerServices('development')

    stub = createStubHttp()
    const repo = createFakeRepo()
    dashboard = createDashboardService(repo)
    data = createDataService({
        repo,
        subscriptions: createFakeSubscriptionsRepo(),
        http: stub.http,
        cache: createTtlCache<CachedWidgetData>(),
    })
})

async function fetchWidget(params: Record<string, unknown> = {}) {
    const instance = await dashboard.create(ALICE, { serviceId: 'epic_games', widgetId: 'free_games', params })
    return data.getInstanceData(ALICE, instance.id)
}

interface GameOut {
    id: string
    title: string
    publisher: string | null
    image: string | null
    url: string
    originalPrice: string | null
    startsAt: string
    endsAt: string
}

/** The two lists of a successful fetch; fails the test with the code otherwise. */
async function fetchGames(elements: unknown[]): Promise<{ current: GameOut[]; upcoming: GameOut[] }> {
    stub.replyWith(() => bodyWith(elements))
    const result = await fetchWidget()
    if (!result.ok) throw new Error(`expected ok: true, got code "${result.code}"`)
    return result.data as { current: GameOut[]; upcoming: GameOut[] }
}

function ids(games: GameOut[]): string[] {
    return games.map((game) => game.id)
}

/** One upstream offer; free (0 percent) for a week unless overridden. */
function offer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        startDate: '2026-10-01T15:00:00.000Z',
        endDate: '2026-10-08T15:00:00.000Z',
        discountSetting: { discountType: 'PERCENTAGE', discountPercentage: 0 },
        ...overrides,
    }
}

/** An offer that is a sale, not a giveaway. */
function sale(percentage: unknown): Record<string, unknown> {
    return offer({ discountSetting: { discountType: 'PERCENTAGE', discountPercentage: percentage } })
}

/** The `promotions` field of a game with these offers running now. */
function now(...offers: unknown[]): Record<string, unknown> {
    return { promotionalOffers: [{ promotionalOffers: offers }], upcomingPromotionalOffers: [] }
}

/** The `promotions` field of a game with these offers announced for later. */
function later(...offers: unknown[]): Record<string, unknown> {
    return { promotionalOffers: [], upcomingPromotionalOffers: [{ promotionalOffers: offers }] }
}

let sequence = 0

/** A well-formed upstream game, free right now; each call gets a unique id and title. */
function gameRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    sequence += 1
    return {
        id: `game-${sequence}`,
        namespace: `namespace-${sequence}`,
        title: `Game ${sequence}`,
        description: 'A game',
        offerType: 'BASE_GAME',
        status: 'ACTIVE',
        seller: { id: 'o-seller', name: 'Studio' },
        productSlug: null,
        urlSlug: 'f350878fcb5242d6851cfe2fa1316e76',
        keyImages: [
            { type: 'OfferImageWide', url: `https://cdn.example/${sequence}-wide.jpg` },
            { type: 'OfferImageTall', url: `https://cdn.example/${sequence}-tall.jpg` },
            { type: 'Thumbnail', url: `https://cdn.example/${sequence}-thumb.jpg` },
        ],
        catalogNs: { mappings: [{ pageSlug: `game-${sequence}-slug`, pageType: 'productHome' }] },
        offerMappings: [{ pageSlug: `game-${sequence}-slug`, pageType: 'productHome' }],
        price: {
            totalPrice: {
                originalPrice: 1999,
                discountPrice: 0,
                currencyCode: 'EUR',
                currencyInfo: { decimals: 2 },
                fmtPrice: { originalPrice: '€19.99', discountPrice: '0', intermediatePrice: '0' },
            },
        },
        promotions: now(offer()),
        ...overrides,
    }
}

/** The only game of `current` after fetching this one upstream row. */
async function cleaned(overrides: Record<string, unknown>): Promise<GameOut> {
    const games = await fetchGames([gameRow(overrides)])
    expect(games.current).toHaveLength(1)
    return games.current[0]!
}

/** The single upstream request made so far. */
function onlyCall(): URL {
    expect(stub.calls).toHaveLength(1)
    return stub.calls[0]!
}

describe('registration', () => {
    test.each(['production', 'development'])('with NODE_ENV=%j epic_games has exactly the free_games widget', (nodeEnv) => {
        __resetRegistryForTests()
        registerServices(nodeEnv)

        const service = registry.getService('epic_games')
        expect(service?.name).toBe('Epic Games')
        expect(service?.auth).toEqual({ kind: 'none' })
        expect(service?.widgets.map((widget) => widget.id)).toEqual(['free_games'])
    })

    test('the country setting is a string that defaults to ES', () => {
        __resetRegistryForTests()
        registerServices('production')

        const widget = registry.getWidget('epic_games', 'free_games')
        expect(widget?.params).toEqual([
            { name: 'country', label: expect.any(String), type: 'string', default: 'ES' },
        ])
    })

    test('refreshes every half hour by default and never faster than every ten minutes', () => {
        __resetRegistryForTests()
        registerServices('production')

        expect(registry.getWidget('epic_games', 'free_games')?.refresh).toEqual({ default: 1800, min: 600 })
    })

    test('appears in /about.json in production', async () => {
        __resetRegistryForTests()
        registerServices('production')

        const response = await aboutRoutes.handle(new Request('http://localhost/about.json'))
        const body = await response.json()
        const epic = body.server.services.find((service: { name: string }) => service.name === 'Epic Games')

        expect(epic.widgets).toEqual([
            {
                name: 'Free games',
                description: expect.any(String),
                params: [{ name: 'country', type: 'string' }],
            },
        ])
    })
})

describe('request', () => {
    test('asks the store for its promotions in English, for Spain by default', async () => {
        await fetchWidget()

        const call = onlyCall()
        expect(call.origin).toBe('https://store-site-backend-static.ak.epicgames.com')
        expect(call.pathname).toBe('/freeGamesPromotions')
        expect(Object.fromEntries(call.searchParams)).toEqual({
            locale: 'en-US',
            country: 'ES',
            allowCountries: 'ES',
        })
    })

    test.each([
        ['US', 'US'],
        ['us', 'US'],
        ['De', 'DE'],
        [' fr ', 'FR'],
    ])('country %j is sent as %j', async (typed, sent) => {
        await fetchWidget({ country: typed })

        const query = Object.fromEntries(onlyCall().searchParams)
        expect(query.country).toBe(sent)
        expect(query.allowCountries).toBe(sent)
    })

    test.each(['', '   ', 'E', 'ESP', 'E1', 'É?', 'E S'])(
        'country %j is not a two-letter code: invalid_config, and the store is never asked',
        async (typed) => {
            const result = await fetchWidget({ country: typed })

            expect(result).toEqual({ ok: false, code: 'invalid_config' })
            expect(stub.calls).toHaveLength(0)
        },
    )
})

describe('answer shape', () => {
    test.each([
        ['null', null],
        ['a string', 'oops'],
        ['a list', []],
        ['an empty object', {}],
        ['data that is null', { data: null }],
        ['data without Catalog', { data: {} }],
        ['Catalog without searchStore', { data: { Catalog: {} } }],
        ['searchStore without elements', { data: { Catalog: { searchStore: {} } } }],
        ['elements that is text', bodyWith('many')],
        ['elements that is an object', bodyWith({})],
    ])('%s is not the promotions list: upstream_error', async (_name, body) => {
        stub.replyWith(() => body)

        expect(await fetchWidget()).toEqual({ ok: false, code: 'upstream_error' })
    })

    test('an empty promotions list is a valid answer with no games', async () => {
        stub.replyWith(() => bodyWith([]))

        const result = await fetchWidget()

        expect(result).toMatchObject({ ok: true, data: { current: [], upcoming: [] } })
    })
})

describe('upstream failures', () => {
    test.each(['rate_limited', 'upstream_error'] as const)('a %s failure of the request is passed through', async (code) => {
        stub.replyWith(() => {
            throw new WidgetFetchError(code, 'stubbed failure')
        })

        expect(await fetchWidget()).toEqual({ ok: false, code })
    })
})

describe('picking the free offers', () => {
    test('a game with a 0 percent offer running now is in current, with the offer dates', async () => {
        const games = await fetchGames([gameRow({ id: 'free-now', title: 'Free Now' })])

        expect(games.upcoming).toEqual([])
        expect(games.current).toHaveLength(1)
        expect(games.current[0]).toMatchObject({
            id: 'free-now',
            title: 'Free Now',
            startsAt: '2026-10-01T15:00:00.000Z',
            endsAt: '2026-10-08T15:00:00.000Z',
        })
    })

    test('a game with a 0 percent offer announced for later is in upcoming, with the offer dates', async () => {
        const promotions = later(offer({ startDate: '2026-10-08T15:00:00.000Z', endDate: '2026-10-15T15:00:00.000Z' }))

        const games = await fetchGames([gameRow({ id: 'free-next', promotions })])

        expect(games.current).toEqual([])
        expect(games.upcoming).toHaveLength(1)
        expect(games.upcoming[0]).toMatchObject({
            id: 'free-next',
            startsAt: '2026-10-08T15:00:00.000Z',
            endsAt: '2026-10-15T15:00:00.000Z',
        })
    })

    test('a game free now and free again later is in both lists', async () => {
        const promotions = {
            promotionalOffers: [{ promotionalOffers: [offer()] }],
            upcomingPromotionalOffers: [
                { promotionalOffers: [offer({ startDate: '2026-12-10T16:00:00.000Z', endDate: '2026-12-17T16:00:00.000Z' })] },
            ],
        }

        const games = await fetchGames([gameRow({ id: 'twice', promotions })])

        expect(games.current[0]).toMatchObject({ id: 'twice', endsAt: '2026-10-08T15:00:00.000Z' })
        expect(games.upcoming[0]).toMatchObject({ id: 'twice', startsAt: '2026-12-10T16:00:00.000Z' })
    })

    test.each([20, 60, 100, '0', null, undefined])('an offer at %j percent is a sale, not a giveaway: dropped', async (percentage) => {
        const games = await fetchGames([
            gameRow({ promotions: now(sale(percentage)) }),
            gameRow({ promotions: later(sale(percentage)) }),
        ])

        expect(games).toEqual({ current: [], upcoming: [] })
    })

    test.each([
        ['promotions that is null', { promotions: null }],
        ['no promotions field', { promotions: undefined }],
        ['promotions that is text', { promotions: 'soon' }],
        ['offer lists that are not lists', { promotions: { promotionalOffers: 'none', upcomingPromotionalOffers: {} } }],
        ['empty offer lists', { promotions: { promotionalOffers: [], upcomingPromotionalOffers: [] } }],
        ['a group that is not an object', { promotions: { promotionalOffers: [null, 'x'], upcomingPromotionalOffers: [7] } }],
        ['a group without offers', { promotions: { promotionalOffers: [{}], upcomingPromotionalOffers: [{ promotionalOffers: null }] } }],
        ['offers that are not objects', { promotions: now(null, 'free', 0) }],
        ['an offer without discountSetting', { promotions: now(offer({ discountSetting: undefined })) }],
    ])('a game with %s is dropped', async (_name, overrides) => {
        const games = await fetchGames([gameRow(overrides)])

        expect(games).toEqual({ current: [], upcoming: [] })
    })

    test.each([
        ['no start date', { startDate: undefined }],
        ['a start date that is null', { startDate: null }],
        ['a start date that is not a date', { startDate: 'soon' }],
        ['a start date that is a number', { startDate: 1791000000000 }],
        ['no end date', { endDate: undefined }],
        ['an end date that is not a date', { endDate: '' }],
    ])('a free offer with %s is ignored', async (_name, overrides) => {
        const games = await fetchGames([gameRow({ promotions: now(offer(overrides)) })])

        expect(games.current).toEqual([])
    })

    test('a game on sale and free in the same list keeps the dates of the free offer', async () => {
        const promotions = later(
            offer({
                startDate: '2026-10-19T15:00:00.000Z',
                endDate: '2026-11-02T16:00:00.000Z',
                discountSetting: { discountType: 'PERCENTAGE', discountPercentage: 35 },
            }),
            offer({ startDate: '2026-12-10T16:00:00.000Z', endDate: '2026-12-17T16:00:00.000Z' }),
        )

        const games = await fetchGames([gameRow({ promotions })])

        expect(games.upcoming[0]).toMatchObject({
            startsAt: '2026-12-10T16:00:00.000Z',
            endsAt: '2026-12-17T16:00:00.000Z',
        })
    })

    test('with several free offers the earliest one is kept, wherever it sits', async () => {
        const promotions = {
            promotionalOffers: [],
            upcomingPromotionalOffers: [
                { promotionalOffers: [offer({ startDate: '2026-12-10T16:00:00.000Z', endDate: '2026-12-17T16:00:00.000Z' })] },
                { promotionalOffers: [offer({ startDate: '2026-11-05T16:00:00.000Z', endDate: '2026-11-12T16:00:00.000Z' })] },
            ],
        }

        const games = await fetchGames([gameRow({ promotions })])

        expect(games.upcoming).toHaveLength(1)
        expect(games.upcoming[0]).toMatchObject({
            startsAt: '2026-11-05T16:00:00.000Z',
            endsAt: '2026-11-12T16:00:00.000Z',
        })
    })

    test('dates are returned in one format whatever the store sends', async () => {
        const promotions = now(offer({ startDate: '2026-10-01T17:00:00+02:00', endDate: '2026-10-08T15:00:00Z' }))

        const games = await fetchGames([gameRow({ promotions })])

        expect(games.current[0]).toMatchObject({
            startsAt: '2026-10-01T15:00:00.000Z',
            endsAt: '2026-10-08T15:00:00.000Z',
        })
    })

    test('current is ordered by end date, soonest first', async () => {
        const games = await fetchGames([
            gameRow({ id: 'ends-third', promotions: now(offer({ endDate: '2026-10-22T15:00:00.000Z' })) }),
            gameRow({ id: 'ends-first', promotions: now(offer({ endDate: '2026-10-08T15:00:00.000Z' })) }),
            gameRow({ id: 'ends-second', promotions: now(offer({ endDate: '2026-10-15T15:00:00.000Z' })) }),
        ])

        expect(ids(games.current)).toEqual(['ends-first', 'ends-second', 'ends-third'])
    })

    test('upcoming is ordered by start date, soonest first', async () => {
        const games = await fetchGames([
            gameRow({ id: 'starts-second', promotions: later(offer({ startDate: '2026-10-15T15:00:00.000Z', endDate: '2026-10-22T15:00:00.000Z' })) }),
            gameRow({ id: 'starts-third', promotions: later(offer({ startDate: '2026-12-10T16:00:00.000Z', endDate: '2026-10-22T15:00:00.000Z' })) }),
            gameRow({ id: 'starts-first', promotions: later(offer({ startDate: '2026-10-08T15:00:00.000Z', endDate: '2026-12-31T15:00:00.000Z' })) }),
        ])

        expect(ids(games.upcoming)).toEqual(['starts-first', 'starts-second', 'starts-third'])
    })
})

describe('rows that cannot be shown', () => {
    test.each([
        ['null', null],
        ['text', 'a game'],
        ['a number', 7],
        ['a list', []],
    ])('an element that is %s is skipped and the others are kept', async (_name, element) => {
        const games = await fetchGames([element, gameRow({ id: 'kept' })])

        expect(ids(games.current)).toEqual(['kept'])
    })

    test.each([
        ['no id', { id: undefined }],
        ['an id that is a number', { id: 42 }],
        ['a blank id', { id: '  ' }],
        ['no title', { title: undefined }],
        ['a blank title', { title: '   ' }],
        ['a title that is not text', { title: { en: 'Game' } }],
    ])('a game with %s is dropped', async (_name, overrides) => {
        const games = await fetchGames([gameRow(overrides)])

        expect(games.current).toEqual([])
    })

    test('the title is trimmed', async () => {
        const games = await fetchGames([gameRow({ title: '  Out of Sight \n' })])

        expect(games.current[0]?.title).toBe('Out of Sight')
    })
})

describe('game output', () => {
    test('a game has exactly the eight documented fields', async () => {
        const game = await cleaned({
            id: 'cb733f3432db46bca94965b422c33ede',
            title: 'Out of Sight',
            seller: { id: 'o-seller', name: 'The Gang Studio AB' },
            keyImages: [{ type: 'OfferImageWide', url: 'https://cdn.example/out-of-sight-wide.jpg' }],
            catalogNs: { mappings: [{ pageSlug: 'out-of-sight-b96ca8', pageType: 'productHome' }] },
        })

        expect(game).toEqual({
            id: 'cb733f3432db46bca94965b422c33ede',
            title: 'Out of Sight',
            publisher: 'The Gang Studio AB',
            image: 'https://cdn.example/out-of-sight-wide.jpg',
            url: 'https://store.epicgames.com/en-US/p/out-of-sight-b96ca8',
            originalPrice: '€19.99',
            startsAt: '2026-10-01T15:00:00.000Z',
            endsAt: '2026-10-08T15:00:00.000Z',
        })
    })
})

describe('publisher', () => {
    test('is the seller name, trimmed', async () => {
        const game = await cleaned({ seller: { id: 'o-1', name: '  KONAMI ' } })

        expect(game.publisher).toBe('KONAMI')
    })

    test.each([
        ['no seller', { seller: undefined }],
        ['a seller that is null', { seller: null }],
        ['a seller that is text', { seller: 'KONAMI' }],
        ['a seller without a name', { seller: { id: 'o-1' } }],
        ['a blank seller name', { seller: { name: '   ' } }],
        ['a seller name that is not text', { seller: { name: 7 } }],
    ])('is null with %s, and the game is kept', async (_name, overrides) => {
        const game = await cleaned(overrides)

        expect(game.publisher).toBeNull()
    })
})

describe('cover image', () => {
    const wide = { type: 'OfferImageWide', url: 'https://cdn.example/wide.jpg' }
    const thumbnail = { type: 'Thumbnail', url: 'https://cdn.example/thumbnail.jpg' }
    const tall = { type: 'OfferImageTall', url: 'https://cdn.example/tall.jpg' }

    test.each([
        ['the wide image first', [tall, thumbnail, wide], wide.url],
        ['the thumbnail when there is no wide image', [tall, thumbnail], thumbnail.url],
        ['the tall image when it is the only one of the three', [tall], tall.url],
    ])('prefers %s, whatever the order in the list', async (_name, keyImages, expected) => {
        const game = await cleaned({ keyImages })

        expect(game.image).toBe(expected)
    })

    test.each([
        ['an http:// address', 'http://cdn.example/wide.jpg'],
        ['a video address', 'com.epicgames.video://1b5ad2a6-bc5f-4d04-a1aa-1e680cde0ba3?cover=x'],
        ['a blank address', '  '],
        ['an address that is not text', 404],
    ])('a wide image with %s is passed over for the next usable one', async (_name, url) => {
        const game = await cleaned({ keyImages: [{ type: 'OfferImageWide', url }, thumbnail] })

        expect(game.image).toBe(thumbnail.url)
    })

    test('a second image of the same type is used when the first is unusable', async () => {
        const game = await cleaned({
            keyImages: [{ type: 'OfferImageWide', url: 'http://cdn.example/insecure.jpg' }, wide, thumbnail],
        })

        expect(game.image).toBe(wide.url)
    })

    test('the address is trimmed', async () => {
        const game = await cleaned({ keyImages: [{ type: 'OfferImageWide', url: ' https://cdn.example/wide.jpg ' }] })

        expect(game.image).toBe('https://cdn.example/wide.jpg')
    })

    test.each([
        ['no keyImages', undefined],
        ['keyImages that is null', null],
        ['keyImages that is text', 'https://cdn.example/wide.jpg'],
        ['an empty list', []],
        ['entries that are not objects', [null, 'https://cdn.example/wide.jpg', 3]],
        ['only other image types', [{ type: 'featuredMedia', url: 'https://cdn.example/media.jpg' }]],
        ['only unusable addresses', [{ type: 'OfferImageWide', url: 'http://cdn.example/wide.jpg' }]],
    ])('is null with %s, and the game is kept', async (_name, keyImages) => {
        const game = await cleaned({ keyImages })

        expect(game.image).toBeNull()
    })
})

describe('store link', () => {
    const FREE_GAMES_PAGE = 'https://store.epicgames.com/en-US/free-games'

    test('is the product page named by the productHome mapping of catalogNs', async () => {
        const game = await cleaned({
            catalogNs: { mappings: [{ pageSlug: 'terrascape-2b12b1', pageType: 'productHome' }] },
            offerMappings: [{ pageSlug: 'something-else', pageType: 'productHome' }],
        })

        expect(game.url).toBe('https://store.epicgames.com/en-US/p/terrascape-2b12b1')
    })

    test('falls back to the productHome mapping of offerMappings', async () => {
        const game = await cleaned({
            catalogNs: { mappings: null },
            offerMappings: [{ pageSlug: 'terrascape-2b12b1', pageType: 'productHome' }],
        })

        expect(game.url).toBe('https://store.epicgames.com/en-US/p/terrascape-2b12b1')
    })

    test('an add-on links to the page of its base game, not to its own offer mapping', async () => {
        const game = await cleaned({
            catalogNs: { mappings: [{ pageSlug: 'lost-castle-abb2e2', pageType: 'productHome' }] },
            offerMappings: [{ pageSlug: 'lost-castle-the-old-ones-awaken-db1545', pageType: 'offer' }],
        })

        expect(game.url).toBe('https://store.epicgames.com/en-US/p/lost-castle-abb2e2')
    })

    test('the slug is trimmed and escaped', async () => {
        const game = await cleaned({
            catalogNs: { mappings: [{ pageSlug: ' a game/home?x=1 ', pageType: 'productHome' }] },
        })

        expect(game.url).toBe('https://store.epicgames.com/en-US/p/a%20game%2Fhome%3Fx%3D1')
    })

    test('a blank slug is passed over for the next mapping', async () => {
        const game = await cleaned({
            catalogNs: {
                mappings: [
                    { pageSlug: '  ', pageType: 'productHome' },
                    { pageSlug: 'luftrausers-51e5e9', pageType: 'productHome' },
                ],
            },
        })

        expect(game.url).toBe('https://store.epicgames.com/en-US/p/luftrausers-51e5e9')
    })

    test.each([
        ['no mappings at all', { catalogNs: undefined, offerMappings: undefined }],
        ['mappings that are null', { catalogNs: null, offerMappings: null }],
        ['empty mappings', { catalogNs: { mappings: [] }, offerMappings: [] }],
        ['mappings that are not objects', { catalogNs: { mappings: ['slug', null] }, offerMappings: [7] }],
        ['only mappings of another page type', { catalogNs: { mappings: [] }, offerMappings: [{ pageSlug: 'an-offer', pageType: 'offer' }] }],
        ['a slug that is not text', { catalogNs: { mappings: [{ pageSlug: 12, pageType: 'productHome' }] }, offerMappings: [] }],
    ])('with %s it is the free games page, and the game is kept', async (_name, overrides) => {
        const game = await cleaned(overrides)

        expect(game.url).toBe(FREE_GAMES_PAGE)
    })

    test('the urlSlug and productSlug fields are never used', async () => {
        const game = await cleaned({
            productSlug: 'thems-fightin-herds/home',
            urlSlug: 'f350878fcb5242d6851cfe2fa1316e76',
            catalogNs: { mappings: [] },
            offerMappings: [],
        })

        expect(game.url).toBe(FREE_GAMES_PAGE)
    })
})

describe('original price', () => {
    function price(totalPrice: unknown): Record<string, unknown> {
        return { price: { totalPrice } }
    }

    test('is the formatted original price, trimmed', async () => {
        const game = await cleaned(price({ originalPrice: 2699, discountPrice: 0, fmtPrice: { originalPrice: ' €26.99 ' } }))

        expect(game.originalPrice).toBe('€26.99')
    })

    test.each([
        ['no price', { price: undefined }],
        ['a price that is null', { price: null }],
        ['no totalPrice', { price: {} }],
        ['an amount of 0', price({ originalPrice: 0, fmtPrice: { originalPrice: '0' } })],
        ['a negative amount', price({ originalPrice: -1, fmtPrice: { originalPrice: '-€0.01' } })],
        ['an amount that is text', price({ originalPrice: '2699', fmtPrice: { originalPrice: '€26.99' } })],
        ['no amount', price({ fmtPrice: { originalPrice: '€26.99' } })],
        ['no formatted prices', price({ originalPrice: 2699 })],
        ['a blank formatted price', price({ originalPrice: 2699, fmtPrice: { originalPrice: ' ' } })],
        ['a formatted price that is not text', price({ originalPrice: 2699, fmtPrice: { originalPrice: 26.99 } })],
    ])('is null with %s, and the game is kept', async (_name, overrides) => {
        const game = await cleaned(overrides)

        expect(game.originalPrice).toBeNull()
    })
})

describe('caching', () => {
    test('a second request for the same widget is served from cache without asking the store', async () => {
        stub.replyWith(() => bodyWith([gameRow({ id: 'cached' })]))
        const instance = await dashboard.create(ALICE, { serviceId: 'epic_games', widgetId: 'free_games', params: {} })

        const first = await data.getInstanceData(ALICE, instance.id)
        const second = await data.getInstanceData(ALICE, instance.id)

        expect(stub.calls).toHaveLength(1)
        expect(second).toEqual(first)
    })

    test('two widgets for the same country share one request', async () => {
        await fetchWidget({ country: 'FR' })
        await fetchWidget({ country: 'FR' })

        expect(stub.calls).toHaveLength(1)
    })

    test('a widget for another country asks the store again', async () => {
        await fetchWidget({ country: 'ES' })
        await fetchWidget({ country: 'US' })

        expect(stub.calls.map((call) => call.searchParams.get('country'))).toEqual(['ES', 'US'])
    })

    test('a failed request is not cached: the next one asks the store again', async () => {
        stub.replyWith(() => 'not the promotions list')
        const instance = await dashboard.create(ALICE, { serviceId: 'epic_games', widgetId: 'free_games', params: {} })
        expect(await data.getInstanceData(ALICE, instance.id)).toEqual({ ok: false, code: 'upstream_error' })

        stub.replyWith(() => bodyWith([gameRow({ id: 'back' })]))
        const result = await data.getInstanceData(ALICE, instance.id)

        expect(stub.calls).toHaveLength(2)
        expect(result).toMatchObject({ ok: true, data: { current: [{ id: 'back' }] } })
    })
})
