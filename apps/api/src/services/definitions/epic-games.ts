/**
 * Epic Games Store — the games that are free for a limited time.
 *
 * One widget, `free_games`: the games free right now and the ones announced
 * as free next. Games that are always free and ordinary sales are left out.
 *
 * Every request goes through `ctx.http`, which already turns a 429 into
 * `rate_limited` and any other HTTP or network failure into `upstream_error`.
 * This file adds what the upstream cannot do for us: checking the body's
 * shape, keeping only the giveaways, and cleaning each game before it
 * reaches the frontend.
 */
import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

/** The address the store's own front page reads its promotions from. No key, but undocumented. */
const PROMOTIONS_URL = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions'

/** The store's pages in English; a game's page is STORE_URL/p/<slug>. */
const STORE_URL = 'https://store.epicgames.com/en-US'

/** The language of titles and formatted prices. The dashboard is English only. */
const LOCALE = 'en-US'

/** Giveaways and prices depend on the store country; this is the one used until the user picks another. */
const DEFAULT_COUNTRY = 'ES'

/** Where the list of games sits inside the store's answer: body.data.Catalog.searchStore.elements */
const ELEMENTS_PATH = ['data', 'Catalog', 'searchStore', 'elements']

/**
 * The image types that work as a cover, best first. A game also carries
 * videos and screenshots under other types; those are never used.
 */
const COVER_TYPES = ['OfferImageWide', 'Thumbnail', 'OfferImageTall']

/** The page type of a game's own store page, among the pages a game is mapped to. */
const PRODUCT_PAGE = 'productHome'

/** Any JSON object whose fields have not been checked yet. */
type Row = Record<string, unknown>

/**
 * The two places a game keeps its offers: the ones running now and the ones
 * announced for later.
 */
type OfferList = 'promotionalOffers' | 'upcomingPromotionalOffers'

/** The period during which a game costs nothing, as two ISO 8601 dates. */
interface FreeWindow {
    startsAt: string
    endsAt: string
}

/** One game, as the frontend receives it. */
interface FreeGame {
    id: string
    title: string
    publisher: string | null
    /** Always https://, because the page is served over https and the browser would block anything else. */
    image: string | null
    /** The game's store page, or the store's free games page when the game has no page of its own. */
    url: string
    /** The usual price as the store writes it, e.g. "€26.99"; null when the game has none. */
    originalPrice: string | null
    startsAt: string
    endsAt: string
}

function isRow(value: unknown): value is Row {
    return typeof value === 'object' && value !== null
}

/** The value when it is a list, otherwise an empty list, so it can always be looped over. */
function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
}

/** Trimmed string, or null when the value is missing, not a string or blank. */
function text(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

/** The date in ISO 8601 (2026-10-08T15:00:00.000Z), or null when the value is not a readable date. */
function isoDate(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const milliseconds = Date.parse(value)
    return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString()
}

/**
 * The country setting as the store expects it: two capital letters. The
 * setting is free text, so spaces around it and lower case are forgiven;
 * anything else is a configuration mistake the user has to fix.
 */
function countryCode(value: unknown): string {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
    if (!/^[A-Z]{2}$/.test(code)) {
        throw new WidgetFetchError('invalid_config', 'Epic Games: country must be a two-letter code')
    }
    return code
}

/**
 * The list of games inside the store's answer, or null when the answer does
 * not have the expected shape. The endpoint is undocumented, so nothing about
 * the body is taken for granted.
 */
function elementsOf(body: unknown): unknown[] | null {
    let node: unknown = body
    for (const key of ELEMENTS_PATH) {
        if (!isRow(node)) return null
        node = node[key]
    }
    return Array.isArray(node) ? node : null
}

/**
 * The period of one offer when it is a giveaway, otherwise null. The store
 * marks a giveaway with `discountPercentage: 0`; any other value is an
 * ordinary sale.
 */
function giveaway(offer: unknown): FreeWindow | null {
    if (!isRow(offer) || !isRow(offer.discountSetting)) return null
    if (offer.discountSetting.discountPercentage !== 0) return null

    const startsAt = isoDate(offer.startDate)
    const endsAt = isoDate(offer.endDate)
    if (startsAt === null || endsAt === null) return null

    return { startsAt, endsAt }
}

/**
 * The earliest period in which the game is free, looking only at one of its
 * two offer lists, or null when that list holds no giveaway.
 *
 * Offers come in groups, so there are two levels to go through:
 * promotions[offers][n].promotionalOffers[m].
 */
function freeWindow(game: Row, offers: OfferList): FreeWindow | null {
    if (!isRow(game.promotions)) return null

    const windows = list(game.promotions[offers])
        .flatMap((group) => (isRow(group) ? list(group.promotionalOffers) : []))
        .map(giveaway)
        .filter((window) => window !== null)
        // ISO dates in the same format sort like text.
        .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))

    return windows[0] ?? null
}

/** The name of the company selling the game, or null when the store does not give one. */
function publisher(game: Row): string | null {
    return isRow(game.seller) ? text(game.seller.name) : null
}

/**
 * The address of the best cover the game has, or null when it has none that
 * can be shown. Only https:// addresses count: the list also holds videos
 * (com.epicgames.video://...), and an http:// image would be blocked.
 */
function cover(game: Row): string | null {
    const images = list(game.keyImages).filter(isRow)

    for (const type of COVER_TYPES) {
        const address = images
            .filter((image) => image.type === type)
            .map((image) => text(image.url))
            .find((url) => url?.startsWith('https://'))
        if (address) return address
    }

    return null
}

/**
 * The page to open for this game. A game is mapped to its pages in two
 * fields, `catalogNs.mappings` first and `offerMappings` second; the slug of
 * its product page is what goes in the address. The `urlSlug` and
 * `productSlug` fields look like the right ones but are usually an internal
 * id or empty. Mystery games have no page until they are revealed, so they
 * link to the page listing all the free games.
 */
function storeUrl(game: Row): string {
    const mappings = [
        ...list(isRow(game.catalogNs) ? game.catalogNs.mappings : null),
        ...list(game.offerMappings),
    ]

    const slug = mappings
        .filter(isRow)
        .filter((mapping) => mapping.pageType === PRODUCT_PAGE)
        .map((mapping) => text(mapping.pageSlug))
        .find((pageSlug) => pageSlug !== null)

    return slug ? `${STORE_URL}/p/${encodeURIComponent(slug)}` : `${STORE_URL}/free-games`
}

/**
 * The usual price, already formatted by the store for the chosen country
 * (e.g. "€26.99"), or null when there is no price to strike through: the
 * amount is missing or is 0, as for a game that is always free.
 */
function originalPrice(game: Row): string | null {
    const total = isRow(game.price) ? game.price.totalPrice : null
    if (!isRow(total) || typeof total.originalPrice !== 'number' || total.originalPrice <= 0) return null

    return isRow(total.fmtPrice) ? text(total.fmtPrice.originalPrice) : null
}

/**
 * Turns one upstream row into a FreeGame, or null when the row cannot be
 * shown: it is not an object, it has no id or title, or it is not free in
 * the given offer list. A missing publisher, cover, page or price does not
 * drop the game; the card is simply drawn without it.
 */
function cleanGame(raw: unknown, offers: OfferList): FreeGame | null {
    if (!isRow(raw)) return null

    const id = text(raw.id)
    const title = text(raw.title)
    const free = freeWindow(raw, offers)
    if (id === null || title === null || free === null) return null

    return {
        id,
        title,
        publisher: publisher(raw),
        image: cover(raw),
        url: storeUrl(raw),
        originalPrice: originalPrice(raw),
        startsAt: free.startsAt,
        endsAt: free.endsAt,
    }
}

/** The games that are free in the given offer list, ordered by the given date, soonest first. */
function freeGames(elements: unknown[], offers: OfferList, orderBy: keyof FreeWindow): FreeGame[] {
    return elements
        .map((element) => cleanGame(element, offers))
        .filter((game) => game !== null)
        .toSorted((a, b) => a[orderBy].localeCompare(b[orderBy]))
}

export const epicGamesService: ServiceDef = {
    id: 'epic_games',
    name: 'Epic Games',
    auth: { kind: 'none' },

    widgets: [
        {
            id: 'free_games',
            name: 'Free games',
            description: 'Games that are free on the Epic Games Store for a limited time: free now and coming next',
            params: [
                {
                    name: 'country',
                    label: 'Store country (two-letter code, e.g. ES)',
                    type: 'string',
                    default: DEFAULT_COUNTRY,
                },
            ],

            /**
             * Giveaways change about once a week. `min` is also how long an
             * answer stays in the shared cache, so it bounds how long a game
             * that has just ended can still be shown.
             */
            refresh: { default: 1800, min: 600 },

            async fetch(ctx, params) {
                const country = countryCode(params.country)
                const search = new URLSearchParams({ locale: LOCALE, country, allowCountries: country })

                const body = await ctx.http.json(`${PROMOTIONS_URL}?${search}`)

                const elements = elementsOf(body)
                if (elements === null) {
                    throw new WidgetFetchError('upstream_error', 'Epic Games: the promotions list is missing from the answer')
                }

                return {
                    // The game about to end comes first; the next one to start comes first.
                    current: freeGames(elements, 'promotionalOffers', 'endsAt'),
                    upcoming: freeGames(elements, 'upcomingPromotionalOffers', 'startsAt'),
                }
            },
        },
    ],
}