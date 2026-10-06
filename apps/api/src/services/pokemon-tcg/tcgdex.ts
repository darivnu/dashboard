/**
 * Every request to TCGdex (https://tcgdex.dev), the upstream of pokemon_tcg.
 *
 * Both functions use its GraphQL endpoint: one request there answers what
 * the REST API needs several for (a collection with its serie and boosters,
 * a card with its rarity and variants). The body is treated as untrusted:
 * anything that is not the documented shape is `upstream_error`.
 */
import type { HttpClient } from '../types'
import { WidgetFetchError } from '../types'

const GRAPHQL_URL = 'https://api.tcgdex.net/v2/graphql'

// The largest collection holds about 300 cards, so one page is the usual
// case and a second one the exception. MAX_PAGES only stops a runaway loop.
const PAGE_SIZE = 250
const MAX_PAGES = 10

// Basic energies as TCGdex names them through the years: "Grass Energy",
// then "Basic Grass Energy". Special energies never match.
const BASIC_ENERGY_NAME = /^(Basic )?(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy) Energy$/

export interface TcgBooster {
    id: string
    name: string
}

export interface TcgSet {
    id: string
    name: string
    serie: { id: string; name: string }
    logo: string | null
    /** The boosters of a TCG Pocket collection; empty everywhere else. */
    boosters: TcgBooster[]
}

export interface CardImage {
    low: string
    high: string
}

export interface CardVariants {
    normal: boolean
    reverse: boolean
    holo: boolean
}

export interface TcgCard {
    id: string
    /** The number printed on the card. A string: "001", "TG05", "28a". */
    localId: string
    name: string
    rarity: string
    suffix: string | null
    basicEnergy: boolean
    image: CardImage | null
    variants: CardVariants | null
    /** Ids of the boosters this card can come out of (TCG Pocket). */
    boosters: string[]
}

const SETS_QUERY = `{
    sets {
        id
        name
        logo
        serie { id name }
        boosters { id name }
    }
}`

const CARDS_QUERY = `query ($filters: CardsFilters, $pagination: Pagination) {
    cards(filters: $filters, pagination: $pagination) {
        id
        localId
        name
        rarity
        category
        suffix
        energyType
        image
        set { id }
        variants { normal reverse holo }
        boosters { id }
    }
}`

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHttps(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('https://')
}

function unexpected(what: string): WidgetFetchError {
    return new WidgetFetchError('upstream_error', `TCGdex: unexpected ${what}`)
}

/**
 * TCGdex gives a card image without quality or format, and that bare URL is
 * a help page, not a picture. Only https is accepted, so that nothing else
 * can end up in an `<img>`.
 */
export function imageUrls(image: unknown): CardImage | null {
    if (!isHttps(image)) return null
    return { low: `${image}/low.webp`, high: `${image}/high.webp` }
}

export function logoUrl(logo: unknown): string | null {
    if (!isHttps(logo)) return null
    return `${logo}.webp`
}

/** Sends one GraphQL query and returns its `data` object. */
async function graphql(http: HttpClient, query: string, variables?: Json): Promise<Json> {
    const body = await http.json(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    })

    // GraphQL answers 200 even when the query failed; the failure is in `errors`.
    if (!isRecord(body) || Array.isArray(body.errors) || !isRecord(body.data)) {
        throw unexpected('GraphQL answer')
    }
    return body.data
}

function toBooster(raw: unknown): TcgBooster | null {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
    return { id: raw.id, name: raw.name }
}

function toBoosters(raw: unknown): TcgBooster[] {
    if (!Array.isArray(raw)) return []
    return raw.map(toBooster).filter((booster) => booster !== null)
}

function toSet(raw: unknown): TcgSet | null {
    if (!isRecord(raw) || !isRecord(raw.serie)) return null
    const { id, name, serie } = raw
    if (typeof id !== 'string' || typeof name !== 'string' || name.trim() === '') return null
    if (typeof serie.id !== 'string' || typeof serie.name !== 'string') return null

    return {
        id,
        name: name.trim(),
        serie: { id: serie.id, name: serie.name },
        logo: logoUrl(raw.logo),
        boosters: toBoosters(raw.boosters),
    }
}

/**
 * Every collection TCGdex knows, in one request. A row that cannot be shown
 * (no id, name or serie) is left out; the caller only keeps the collections
 * it has rules for anyway.
 */
export async function fetchSets(http: HttpClient): Promise<TcgSet[]> {
    const data = await graphql(http, SETS_QUERY)
    if (!Array.isArray(data.sets)) throw unexpected('set list')

    return data.sets.map(toSet).filter((set) => set !== null)
}

function toBoosterIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    return raw.flatMap((booster) => (isRecord(booster) && typeof booster.id === 'string' ? [booster.id] : []))
}

function toVariants(raw: unknown): CardVariants | null {
    if (!isRecord(raw)) return null
    return { normal: raw.normal === true, reverse: raw.reverse === true, holo: raw.holo === true }
}

/**
 * Unlike a collection, a card that cannot be read is not skipped: a missing
 * card would silently change the odds of its pool, so the whole answer is
 * refused instead.
 */
function toCard(raw: unknown): TcgCard {
    if (!isRecord(raw)) throw unexpected('card')
    const { id, localId, name, rarity } = raw
    if (typeof id !== 'string' || typeof localId !== 'string' || typeof name !== 'string' || typeof rarity !== 'string') {
        throw unexpected('card')
    }

    return {
        id,
        localId,
        name,
        rarity,
        suffix: typeof raw.suffix === 'string' ? raw.suffix : null,
        basicEnergy: raw.energyType === 'Normal' && BASIC_ENERGY_NAME.test(name),
        image: imageUrls(raw.image),
        variants: toVariants(raw.variants),
        boosters: toBoosterIds(raw.boosters),
    }
}

function belongsTo(raw: unknown, setId: string): boolean {
    return isRecord(raw) && isRecord(raw.set) && raw.set.id === setId
}

/**
 * Every card of one collection.
 *
 * TCGdex cannot filter cards by collection in GraphQL, only by a piece of
 * their id. Card ids are "<collection>-<number>", so "sv01-" finds them, but
 * the filter matches anywhere in the id: each card's own `set.id` is checked
 * to drop the ones of another collection.
 */
export async function fetchSetCards(http: HttpClient, setId: string): Promise<TcgCard[]> {
    const cards: TcgCard[] = []

    for (let page = 1; page <= MAX_PAGES; page++) {
        const data = await graphql(http, CARDS_QUERY, {
            filters: { id: `${setId}-` },
            pagination: { page, itemsPerPage: PAGE_SIZE },
        })
        if (!Array.isArray(data.cards)) throw unexpected('card list')

        for (const raw of data.cards) {
            if (!isRecord(raw)) throw unexpected('card')
            if (belongsTo(raw, setId)) cards.push(toCard(raw))
        }

        if (data.cards.length < PAGE_SIZE) return cards
    }

    throw unexpected(`number of cards for ${setId}`)
}
