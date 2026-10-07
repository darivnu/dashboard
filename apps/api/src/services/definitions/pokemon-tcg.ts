/**
 * Pokémon TCG — open booster packs.
 *
 * One widget, `booster_opener`, and one action, `open_pack`. They share the
 * work like this, because a widget's data is cached for every user at once:
 *   - the widget returns what is the same for everybody: the collections
 *     a pack can be opened from;
 *   - the action draws the pack. An action is never cached and is counted
 *     per user, so each click gives that user a pack of their own.
 *
 * The cards come from TCGdex at request time. What a pack is made of (its
 * slots and their odds) comes from the rules in ../pokemon-tcg/, where the
 * matching of cards and the draw itself also live. This file only wires
 * them to the dashboard.
 */
import { getSetCards, getSets } from '../pokemon-tcg/card-store'
import { openPack } from '../pokemon-tcg/open-pack'
import { buildPool, poolContext } from '../pokemon-tcg/pools'
import { getSetRules, openableSetIds } from '../pokemon-tcg/rules'
import type { Confidence, Outcome, Pack, SetRules } from '../pokemon-tcg/rules'
import type { CardImage, TcgBooster, TcgCard, TcgSet } from '../pokemon-tcg/tcgdex'
import type { HttpClient, ServiceDef, WidgetParams } from '../types'
import { WidgetFetchError } from '../types'

/** The collection a new widget opens packs of until the user picks another: Base Set, the first one. */
const DEFAULT_SET = 'base1'

/** One collection of the widget's list, as the frontend receives it. */
interface PackSet {
    id: string
    name: string
    serie: { id: string; name: string }
    logo: string | null
    cardsPerPack: number
    /** How well the odds of this collection are known. */
    confidence: Confidence
    /** The boosters to choose between; empty when the collection has a single pack. */
    boosters: TcgBooster[]
}

/** One card of an opened pack, as the frontend receives it. */
interface PackCard {
    id: string
    name: string
    rarity: string
    image: CardImage | null
    slot: string
    kind: string
    reverseHolo: boolean
    pattern: string | null
}

/** A string param, or undefined when it is absent or blank. */
function textParam(params: WidgetParams, name: string): string | undefined {
    const value = params[name]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function rulesFor(setId: string): SetRules {
    const rules = getSetRules(setId)
    if (!rules) throw new WidgetFetchError('invalid_config', `pokemon_tcg: unknown collection "${setId}"`)
    return rules
}

function toPackSet(set: TcgSet, rules: SetRules): PackSet {
    return {
        id: set.id,
        name: set.name,
        serie: set.serie,
        logo: set.logo,
        cardsPerPack: rules.cardsPerPack,
        confidence: rules.confidence,
        // Kept in TCGdex's order, and only those the rules know how to open.
        boosters: set.boosters.filter((booster) => rules.boosters.includes(booster.id)),
    }
}

/** Every collection whose cards a pack of this one can hold: itself and the ones it borrows from. */
function sourceSetIds(setId: string, rules: SetRules): string[] {
    const ids = new Set([setId])
    const packs: Pack[] = [rules, ...rules.variants]
    for (const pack of packs) {
        for (const slot of pack.slots) {
            for (const outcome of slot.outcomes) {
                if (outcome.set) ids.add(outcome.set)
            }
        }
    }
    return [...ids]
}

async function openPackOf(http: HttpClient, setId: string, rules: SetRules, booster: string | null) {
    const set = (await getSets(http)).find((candidate) => candidate.id === setId)
    if (!set) throw new WidgetFetchError('upstream_error', `pokemon_tcg: TCGdex no longer lists "${setId}"`)

    // The collections are independent, so they are asked for at the same time.
    const ids = sourceSetIds(setId, rules)
    const lists = await Promise.all(ids.map((id) => getSetCards(http, id)))
    const cardsBySet = new Map(ids.map((id, index) => [id, lists[index]]))

    const context = poolContext(setId, rules, cardsBySet.get(setId) ?? [], set.boosters.map((each) => each.id), booster)

    // An outcome is rolled many times in one pack; its pool is worked out once.
    const pools = new Map<Outcome, TcgCard[]>()
    function poolOf(outcome: Outcome): TcgCard[] {
        let pool = pools.get(outcome)
        if (!pool) {
            pool = buildPool(cardsBySet.get(outcome.set ?? setId) ?? [], outcome, context)
            pools.set(outcome, pool)
        }
        return pool
    }

    const opened = openPack(rules, poolOf)
    const cards: PackCard[] = opened.cards.map((drawn) => ({
        id: drawn.card.id,
        name: drawn.card.name,
        rarity: drawn.card.rarity,
        image: drawn.card.image,
        slot: drawn.slot,
        kind: drawn.kind,
        reverseHolo: drawn.reverseHolo,
        pattern: drawn.pattern,
    }))

    return {
        set: { id: set.id, name: set.name },
        booster: context.booster,
        variant: opened.variant,
        cards,
        extras: opened.extras,
    }
}

export const pokemonTcgService: ServiceDef = {
    id: 'pokemon_tcg',
    name: 'Pokémon TCG',
    auth: { kind: 'none' },

    widgets: [
        {
            id: 'booster_opener',
            name: 'Booster opener',
            description: 'Open booster packs of a Pokémon TCG collection',

            // Both are written by the widget itself when the user picks from
            // its lists, so they are hidden from the settings form: nobody
            // should have to know a collection id. A new widget starts on
            // DEFAULT_SET and the user changes it from there.
            params: [
                { name: 'set', label: 'Collection', type: 'string', hidden: true, default: DEFAULT_SET },
                { name: 'booster', label: 'Booster', type: 'string', hidden: true },
            ],

            // Collections come out a few times a year, so `min` only bounds
            // how long a new one stays out of the shared cache.
            refresh: { default: 3600, min: 600 },

            // The saved collection is not checked here: the list is the same
            // whatever it is, and refusing an unknown one would hide the very
            // list the user needs to pick a valid one. The widget treats a
            // collection it cannot find as none chosen.
            async fetch(ctx) {
                const upstream = new Map((await getSets(ctx.http)).map((set) => [set.id, set]))

                // The rules list the collections oldest first; one that
                // TCGdex does not have (any more) is left out.
                const sets: PackSet[] = []
                for (const id of openableSetIds()) {
                    const set = upstream.get(id)
                    if (set) sets.push(toPackSet(set, rulesFor(id)))
                }
                return { sets }
            },
        },
    ],

    actions: [
        {
            id: 'open_pack',
            name: 'Open pack',
            description: 'Opens one booster pack of a collection and returns its cards in pack order',

            params: [
                { name: 'set', label: 'Collection id, for example sv01', type: 'string', required: true },
                { name: 'booster', label: 'Booster id, for collections with several', type: 'string' },
            ],

            // A pack is a click, and after the first one of a collection it
            // costs no upstream request; this only stops a script from looping.
            rateLimit: { max: 30, windowSeconds: 60 },

            async run(ctx, params) {
                const setId = textParam(params, 'set') ?? ''
                const rules = rulesFor(setId)

                // Checked against the rules, not TCGdex, so that a wrong
                // booster is refused before any request is sent.
                const booster = textParam(params, 'booster') ?? null
                if (booster && !rules.boosters.includes(booster)) {
                    throw new WidgetFetchError('invalid_config', `pokemon_tcg: "${setId}" has no booster "${booster}"`)
                }

                return openPackOf(ctx.http, setId, rules, booster)
            },
        },
    ],
}
