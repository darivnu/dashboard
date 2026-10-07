/// <reference path="./pack-rules.d.ts" />
/**
 * The pack rules: what a booster pack of each collection is made of.
 *
 * pack-rules.json holds, for the 152 collections sold as booster packs, the
 * slots of a pack and the odds of each slot. It holds no card: which cards
 * are a "Rare" of a collection is asked to TCGdex (tcgdex.ts) and matched
 * against these rules in pools.ts.
 *
 * Vocabulary, from the outside in:
 *   pack     a list of slots
 *   slot     a position in the pack, drawn `count` times ("4 commons")
 *   outcome  one thing a slot can give, with its odds ("Double rare, 16.7 %")
 *   variant  a whole different pack that sometimes replaces the normal one
 */
import file from './pack-rules.json'

export type Confidence = 'high' | 'medium' | 'low'

/** Descriptive only: what the slot usually holds. Never used to pick a card. */
export type SlotKind = 'common' | 'uncommon' | 'rare' | 'reverse' | 'hit' | 'energy' | 'other'

/**
 * Narrows the cards of an outcome beyond their rarity. Every key is optional
 * and a card must pass all the keys present. pools.ts documents each one.
 */
export interface OutcomeFilter {
    holo?: boolean
    reverse?: boolean
    suffix?: string
    notSuffix?: string
    name?: string[]
    nameContains?: string
    nameNotContains?: string
    namePrefix?: string
    notNamePrefix?: string
    localId?: string | string[]
    notLocalId?: string | string[]
    localIdRange?: [number, number]
    subset?: string
    notSubset?: string
    basicEnergy?: boolean | 'any'
    booster?: string
}

export interface Outcome {
    /** Exact TCGdex rarity strings; a card needs one of them. */
    rarities: string[]
    /** Odds of this outcome inside its slot. The weights of a slot add up to 1. */
    weight: number
    /** Whether the card comes out as its reverse holo print. */
    reverseHolo: boolean
    filter?: OutcomeFilter
    /** Another collection to take the card from, e.g. `sve` for basic energies. */
    set?: string
    /** Special reverse pattern of a few collections: "Poké Ball", "Master Ball". */
    pattern?: string
}

export interface Slot {
    id: string
    /** How many cards this slot puts in the pack. */
    count: number
    kind: SlotKind
    outcomes: Outcome[]
}

export interface Pack {
    cardsPerPack: number
    /** What else is in the pack that is not a card TCGdex knows: code card, some energies. */
    nonCardContents: string[]
    slots: Slot[]
}

/** Replaces the base pack as a whole, with this probability per pack opened. */
export interface PackVariant extends Pack {
    id: string
    probability: number
}

export interface SetRules extends Pack {
    confidence: Confidence
    /**
     * Whether holo, reverse, suffix and booster data of the cards may be
     * trusted. True for collections before 2011 and for TCG Pocket; from
     * Black & White on, TCGdex's flags are incomplete and are ignored.
     */
    detail: boolean
    /**
     * Ids of the boosters the user chooses between, for the few TCG Pocket
     * collections sold as several; empty for every other collection.
     */
    boosters: string[]
    /** Card number prefixes ("SH", "RC") kept out of the pools unless an outcome asks for them. */
    excludeSubsets: string[]
    variants: PackVariant[]
}

interface RulesFile {
    source: string
    /** Collections that are not opened themselves but lend cards to another one's packs. */
    siblings: Record<string, { detail: boolean }>
    sets: Record<string, SetRules>
}

// A Map and not the plain object: `sets['constructor']` would find a function
// on every object, and the id comes straight from a request.
const rulesBySet = new Map(Object.entries((file as RulesFile).sets))
const siblings = new Map(Object.entries((file as RulesFile).siblings))

export function getSetRules(setId: string): SetRules | undefined {
    return rulesBySet.get(setId)
}

/** Every collection with pack rules, oldest first. */
export function openableSetIds(): string[] {
    return [...rulesBySet.keys()]
}

/**
 * Whether the cards of this collection carry trustworthy holo, reverse,
 * suffix and booster data (see SetRules.detail). Asked for the collection a
 * card comes FROM, which for a few outcomes is not the one being opened.
 */
export function hasCardDetails(setId: string): boolean {
    return rulesBySet.get(setId)?.detail ?? siblings.get(setId)?.detail ?? false
}
