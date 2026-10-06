/** How well the odds of a collection are known. */
export type Confidence = 'high' | 'medium' | 'low'

export type Booster = {
    id: string
    name: string
}

/** One collection a pack can be opened from, as the API sends it. */
export type PackSet = {
    id: string
    name: string
    serie: { id: string; name: string }
    /** Always an https:// address when present. */
    logo: string | null
    cardsPerPack: number
    confidence: Confidence
    /** The boosters to choose between; empty when the collection has a single pack. */
    boosters: Booster[]
}

export type BoosterOpenerData = {
    /** Oldest collection first. */
    sets: PackSet[]
}

/** The same picture in two sizes; both are https:// addresses. */
export type CardImage = {
    low: string
    high: string
}

/** One card of an opened pack, as the `open_pack` action sends it. */
export type PackCard = {
    id: string
    name: string
    rarity: string
    image: CardImage | null
    /** The slot of the pack the card came out of, for example "rare". */
    slot: string
    kind: string
    reverseHolo: boolean
    /** A special reverse pattern such as "Master Ball", for a few collections. */
    pattern: string | null
}

export type Pack = {
    set: { id: string; name: string }
    booster: string | null
    /** A whole-pack variant such as a TCG Pocket rare pack, or null for an ordinary pack. */
    variant: string | null
    /** In pack order. */
    cards: PackCard[]
    /** What else was in the pack that is not a card, for example a code card. */
    extras: string[]
}

type Row = Record<string, unknown>

const CONFIDENCES: readonly string[] = ['high', 'medium', 'low']

function isRow(value: unknown): value is Row {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
    return typeof value === 'string' && value !== ''
}

function isTextOrNull(value: unknown): value is string | null {
    return value === null || typeof value === 'string'
}

// These values end up in an <img src>. Anything that is not https:// is
// refused, which also keeps out addresses such as "javascript:...".
function isSecureAddress(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('https://')
}

function isConfidence(value: unknown): value is Confidence {
    return typeof value === 'string' && CONFIDENCES.includes(value)
}

/** The value as a list of rows read by `parseRow`, or a throw from `fail`. */
function listOf<T>(
    value: unknown,
    parseRow: (row: unknown) => T,
    fail: () => never,
): T[] {
    if (!Array.isArray(value)) return fail()
    return value.map(parseRow)
}

function failSets(): never {
    throw new Error('Unexpected booster opener data')
}

function parseNamed(raw: unknown, fail: () => never): Booster {
    if (!isRow(raw)) return fail()
    const { id, name } = raw
    if (!isText(id) || !isText(name)) return fail()
    return { id, name }
}

function parseSet(raw: unknown): PackSet {
    if (!isRow(raw)) return failSets()
    const { id, name, serie, logo, cardsPerPack, confidence, boosters } = raw
    if (!isText(id) || !isText(name)) return failSets()
    if (logo !== null && !isSecureAddress(logo)) return failSets()
    if (!Number.isInteger(cardsPerPack) || (cardsPerPack as number) < 1)
        return failSets()
    if (!isConfidence(confidence)) return failSets()
    return {
        id,
        name,
        serie: parseNamed(serie, failSets),
        logo,
        cardsPerPack: cardsPerPack as number,
        confidence,
        boosters: listOf(
            boosters,
            (booster) => parseNamed(booster, failSets),
            failSets,
        ),
    }
}

/** Checks the data of the widget: the collections a pack can be opened from. */
export function parseBoosterOpener(raw: unknown): BoosterOpenerData {
    if (!isRow(raw)) return failSets()
    return { sets: listOf(raw.sets, parseSet, failSets) }
}

function failPack(): never {
    throw new Error('Unexpected pack data')
}

function parseImage(raw: unknown): CardImage | null {
    if (raw === null) return null
    if (!isRow(raw)) return failPack()
    const { low, high } = raw
    if (!isSecureAddress(low) || !isSecureAddress(high)) return failPack()
    return { low, high }
}

function parseCard(raw: unknown): PackCard {
    if (!isRow(raw)) return failPack()
    const { id, name, rarity, image, slot, kind, reverseHolo, pattern } = raw
    if (!isText(id) || !isText(name) || !isText(rarity)) return failPack()
    if (!isText(slot) || !isText(kind)) return failPack()
    if (typeof reverseHolo !== 'boolean') return failPack()
    if (!isTextOrNull(pattern)) return failPack()
    return {
        id,
        name,
        rarity,
        image: parseImage(image),
        slot,
        kind,
        reverseHolo,
        pattern,
    }
}

/** Checks the answer of the `open_pack` action: one opened pack. */
export function parsePack(raw: unknown): Pack {
    if (!isRow(raw)) return failPack()
    const { set, booster, variant, cards, extras } = raw
    if (!isTextOrNull(booster) || !isTextOrNull(variant)) return failPack()
    const parsedCards = listOf(cards, parseCard, failPack)
    // A pack without a card is not a pack.
    if (parsedCards.length === 0) return failPack()
    return {
        set: parseNamed(set, failPack),
        booster,
        variant,
        cards: parsedCards,
        extras: listOf(
            extras,
            (extra) => (isText(extra) ? extra : failPack()),
            failPack,
        ),
    }
}
