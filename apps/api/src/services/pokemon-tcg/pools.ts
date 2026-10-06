/**
 * Pools: which cards an outcome can give.
 *
 * The rules say "this slot gives a Rare that is holo and is not card 8";
 * TCGdex says what each card is. cardMatches() answers whether one card
 * fits one outcome, and a pool is every card of the collection that does.
 *
 * The matching follows the rules project's own `cardMatches` line for line,
 * because the odds were worked out against the pools it produces: a pool
 * with one card more or less here would shift every pull rate of its slot.
 */
import { hasCardDetails } from './rules'
import type { Outcome, SetRules } from './rules'
import type { TcgCard } from './tcgdex'

export interface PoolContext {
    /** The collection being opened. */
    setId: string
    excludeSubsets: string[]
    /** Whether the cards of the collection say which booster they come out of. */
    setHasBoosterData: boolean
    /** The booster being opened, for a TCG Pocket collection that has booster data. */
    booster: string | null
}

/** The letters a card number starts with: "TG05" → "TG", "SV012" → "SV", "105" → null. */
export function subsetOf(localId: string): string | null {
    const match = /^([A-Za-z]+)\d/.exec(localId)
    return match ? match[1] : null
}

function asList<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value]
}

/**
 * Does this card belong to this outcome's pool?
 *
 * The card needs one of the outcome's rarities and must pass every key of
 * its filter:
 *   basicEnergy   true: only basic energies. false or absent: none of them.
 *                 'any': both (gold energies printed as secret rares).
 *   holo          true: has a holo print. false: has a normal print.
 *   reverse       true: has a reverse holo print.
 *   suffix        the card's suffix is this one ("ex").
 *   notSuffix     the card's suffix is not this one.
 *   name          the card is named exactly one of these.
 *   nameContains / nameNotContains / namePrefix / notNamePrefix
 *   localId       the card number is one of these.
 *   notLocalId    the card number is none of these.
 *   localIdRange  the card number is between the two, inclusive. A number
 *                 with a letter ("28a") is never in a range.
 *   subset        the card number starts with these letters ("TG").
 *   notSubset     the card number does not start with these letters.
 *   booster       the card comes out of this booster. "$booster" stands for
 *                 the booster being opened.
 */
export function cardMatches(card: TcgCard, outcome: Outcome, ctx: PoolContext): boolean {
    if (!outcome.rarities.includes(card.rarity)) return false
    const filter = outcome.filter ?? {}

    // Holo, reverse, suffix and booster are only believed for the collections
    // the rules were researched with them. Elsewhere the card is treated as
    // if TCGdex said nothing, which is what the rules were built against.
    const detailed = hasCardDetails(outcome.set ?? ctx.setId)
    const variants = detailed ? card.variants : null
    const suffix = detailed ? card.suffix : null
    const boosters = detailed ? card.boosters : null

    if (filter.basicEnergy !== 'any' && (filter.basicEnergy ?? false) !== card.basicEnergy) return false

    if (filter.holo === true && !variants?.holo) return false
    if (filter.holo === false && variants && !variants.normal) return false
    if (filter.reverse === true && !variants?.reverse) return false

    if (filter.suffix !== undefined && suffix !== filter.suffix) return false
    if (filter.notSuffix !== undefined && suffix === filter.notSuffix) return false

    if (filter.name && !filter.name.includes(card.name)) return false
    if (filter.nameContains && !card.name.includes(filter.nameContains)) return false
    if (filter.nameNotContains && card.name.includes(filter.nameNotContains)) return false
    if (filter.namePrefix && !card.name.startsWith(filter.namePrefix)) return false
    if (filter.notNamePrefix && card.name.startsWith(filter.notNamePrefix)) return false

    if (filter.localId && !asList(filter.localId).includes(card.localId)) return false
    if (filter.notLocalId && asList(filter.notLocalId).includes(card.localId)) return false
    if (filter.localIdRange) {
        const [from, to] = filter.localIdRange
        const number = /^\d+$/.test(card.localId) ? Number(card.localId) : Number.NaN
        if (!(number >= from && number <= to)) return false
    }

    // A subset the collection excludes (shiny cards, a gallery) stays out of
    // its ordinary pools, but an outcome that names a subset decides for itself.
    const subset = subsetOf(card.localId)
    const ownSet = !outcome.set || outcome.set === ctx.setId
    if (filter.subset !== undefined) {
        if (subset !== filter.subset) return false
    } else if (ownSet && subset !== null && ctx.excludeSubsets.includes(subset)) {
        return false
    }
    if (filter.notSubset !== undefined && subset === filter.notSubset) return false

    if (filter.booster) {
        const booster = filter.booster === '$booster' ? ctx.booster : filter.booster
        if (booster && ctx.setHasBoosterData && !boosters?.includes(booster)) return false
    }

    return true
}

/**
 * The pool of an outcome. `cards` are those of the collection the outcome
 * draws from: `outcome.set` when it names one, the opened collection otherwise.
 */
export function buildPool(cards: TcgCard[], outcome: Outcome, ctx: PoolContext): TcgCard[] {
    return cards.filter((card) => cardMatches(card, outcome, ctx))
}

/**
 * What cardMatches() needs to know about the pack being opened.
 *
 * `setBoosters` are the booster ids TCGdex lists for the collection and
 * `requested` the one the user chose, already checked to be one of them.
 * Only TCG Pocket has boosters, and only some of its collections say which
 * cards are in which: without that data every card stays in every pool.
 */
export function poolContext(
    setId: string,
    rules: SetRules,
    cards: TcgCard[],
    setBoosters: string[],
    requested: string | null,
): PoolContext {
    const setHasBoosterData = rules.detail && cards.some((card) => card.boosters.length > 0)

    let booster: string | null = null
    if (setHasBoosterData) {
        if (rules.boosters.length > 0) booster = requested ?? rules.boosters[0]
        else if (setBoosters.length === 1) booster = setBoosters[0]
    }

    return { setId, excludeSubsets: rules.excludeSubsets, setHasBoosterData, booster }
}
