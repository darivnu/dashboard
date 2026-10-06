/**
 * Keeps what TCGdex answered for an hour, in memory.
 *
 * Opening a pack needs every card of the collection, and that list is the
 * same for every user and changes a few times a year. Without this, each
 * click on "Open pack" would download a few hundred cards again.
 *
 * Only good answers are kept: a failed request is tried again on the next
 * call, and so is a collection that came back without any card.
 */
import { createTtlCache } from '../../lib/cache'
import type { HttpClient } from '../types'
import { fetchSetCards, fetchSets } from './tcgdex'
import type { TcgCard, TcgSet } from './tcgdex'

const TTL_SECONDS = 3600
const SETS_KEY = 'sets'

const setsCache = createTtlCache<TcgSet[]>()
const cardsCache = createTtlCache<TcgCard[]>()

export async function getSets(http: HttpClient): Promise<TcgSet[]> {
    const cached = setsCache.get(SETS_KEY)
    if (cached) return cached

    const sets = await fetchSets(http)
    if (sets.length > 0) setsCache.set(SETS_KEY, sets, TTL_SECONDS)
    return sets
}

export async function getSetCards(http: HttpClient, setId: string): Promise<TcgCard[]> {
    const cached = cardsCache.get(setId)
    if (cached) return cached

    const cards = await fetchSetCards(http, setId)
    if (cards.length > 0) cardsCache.set(setId, cards, TTL_SECONDS)
    return cards
}

/** Empties both caches, so that one test cannot answer for the next. */
export function __resetCardStoreForTests(): void {
    setsCache.clear()
    cardsCache.clear()
}
