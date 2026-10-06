/**
 * The draw: turns a collection's rules and its pools into one opened pack.
 *
 * Nothing here knows about TCGdex or HTTP. The caller hands over the rules,
 * a way to get the pool of an outcome, and the random source; that last one
 * is what lets a test decide every roll and check the exact pack.
 *
 * A pack is opened in three kinds of roll:
 *   1. once per pack: is this one of the collection's whole-pack variants?
 *   2. once per card: which outcome of the slot?
 *   3. once per card: which card of that outcome's pool?
 */
import { WidgetFetchError } from '../types'
import type { Outcome, Pack, SetRules, Slot, SlotKind } from './rules'
import type { TcgCard } from './tcgdex'

/** Gives a number from 0 (included) to 1 (excluded), like Math.random. */
export type Random = () => number

export interface DrawnCard {
    card: TcgCard
    /** Id of the slot the card came out of. */
    slot: string
    kind: SlotKind
    reverseHolo: boolean
    pattern: string | null
}

export interface OpenedPack {
    /** Id of the whole-pack variant that came up, or null for the ordinary pack. */
    variant: string | null
    /** In pack order: the slots as the rules list them. */
    cards: DrawnCard[]
    /** What else was in the pack that is not a card: code card, some energies. */
    extras: string[]
}

/**
 * Roll 1. Each variant owns a stretch of the 0-to-1 line as long as its
 * probability, one after the other; what is left belongs to the base pack.
 * One number says where on the line this pack falls.
 */
export function pickPack(rules: SetRules, random: Random): { variant: string | null; pack: Pack } {
    if (rules.variants.length === 0) return { variant: null, pack: rules }

    let roll = random()
    for (const variant of rules.variants) {
        roll -= variant.probability
        if (roll < 0) return { variant: variant.id, pack: variant }
    }
    return { variant: null, pack: rules }
}

/**
 * Roll 2. Same line, split by the weights of the slot's outcomes. The weights
 * add up to 1 give or take a rounding error, so a roll that slips past the
 * end belongs to the last outcome.
 */
export function pickOutcome(slot: Slot, random: Random): Outcome {
    let roll = random()
    for (const outcome of slot.outcomes) {
        roll -= outcome.weight
        if (roll < 0) return outcome
    }
    return slot.outcomes[slot.outcomes.length - 1]
}

/** Roll 3: every card of the list is as likely as the others. */
function pickCard(cards: TcgCard[], random: Random): TcgCard {
    const index = Math.min(Math.floor(random() * cards.length), cards.length - 1)
    return cards[index]
}

/**
 * Opens one pack. `poolOf` gives the cards an outcome can produce.
 *
 * As in a real pack, a slot does not give the same card twice: the four
 * commons are four different cards. The rule stops at the slot, so the
 * reverse holo may well be a card that is also among the commons; it is a
 * different print. Only when a pool is smaller than its slot (a five-card
 * slot fed by a one-card pool exists) does a card come back.
 */
export function openPack(
    rules: SetRules,
    poolOf: (outcome: Outcome) => TcgCard[],
    random: Random = Math.random,
): OpenedPack {
    const { variant, pack } = pickPack(rules, random)
    const cards: DrawnCard[] = []

    for (const slot of pack.slots) {
        const drawnInSlot = new Set<string>()

        for (let draw = 0; draw < slot.count; draw++) {
            const outcome = pickOutcome(slot, random)
            const pool = poolOf(outcome)
            if (pool.length === 0) {
                throw new WidgetFetchError('upstream_error', `pokemon_tcg: no card for slot "${slot.id}"`)
            }

            const fresh = pool.filter((card) => !drawnInSlot.has(card.id))
            const card = pickCard(fresh.length > 0 ? fresh : pool, random)
            drawnInSlot.add(card.id)

            cards.push({
                card,
                slot: slot.id,
                kind: slot.kind,
                reverseHolo: outcome.reverseHolo,
                pattern: outcome.pattern ?? null,
            })
        }
    }

    return { variant, cards, extras: pack.nonCardContents }
}
