import { describe, expect, test } from 'bun:test'
import { buildPool, cardMatches, poolContext, subsetOf } from './pools'
import type { PoolContext } from './pools'
import { getSetRules } from './rules'
import type { Outcome, OutcomeFilter } from './rules'
import type { TcgCard } from './tcgdex'

function card(overrides: Partial<TcgCard> = {}): TcgCard {
    return {
        id: 'base1-4',
        localId: '4',
        name: 'Charizard',
        rarity: 'Rare',
        suffix: null,
        basicEnergy: false,
        image: null,
        variants: { normal: false, reverse: false, holo: true },
        boosters: [],
        ...overrides,
    }
}

function outcome(filter?: OutcomeFilter, overrides: Partial<Outcome> = {}): Outcome {
    return { rarities: ['Rare'], weight: 1, reverseHolo: false, ...(filter ? { filter } : {}), ...overrides }
}

// base1 is a collection whose card details are trusted; sv01 is not.
const detailed: PoolContext = { setId: 'base1', excludeSubsets: [], setHasBoosterData: false, booster: null }
const modern: PoolContext = { setId: 'sv01', excludeSubsets: [], setHasBoosterData: false, booster: null }

describe('subsetOf', () => {
    test.each([
        ['TG05', 'TG'],
        ['SV012', 'SV'],
        ['RC1', 'RC'],
        ['105', null],
        ['28a', null],
        ['!', null],
        ['', null],
    ])('%s → %p', (localId, expected) => {
        expect(subsetOf(localId)).toBe(expected)
    })
})

describe('cardMatches', () => {
    test('needs one of the rarities, spelled exactly', () => {
        expect(cardMatches(card(), outcome(), detailed)).toBe(true)
        expect(cardMatches(card({ rarity: 'Common' }), outcome(), detailed)).toBe(false)
        expect(cardMatches(card({ rarity: 'rare' }), outcome(), detailed)).toBe(false)
        expect(cardMatches(card({ rarity: 'Uncommon' }), outcome(undefined, { rarities: ['Common', 'Uncommon'] }), detailed)).toBe(true)
    })

    describe('basic energy', () => {
        const energy = card({ rarity: 'Common', basicEnergy: true })
        const pokemon = card({ rarity: 'Common' })
        const common = { rarities: ['Common'] }

        test('stays out of a pool that does not ask for it', () => {
            expect(cardMatches(energy, outcome(undefined, common), detailed)).toBe(false)
            expect(cardMatches(energy, outcome({ basicEnergy: false }, common), detailed)).toBe(false)
            expect(cardMatches(pokemon, outcome(undefined, common), detailed)).toBe(true)
        })

        test('is the only thing in a pool that asks for it', () => {
            expect(cardMatches(energy, outcome({ basicEnergy: true }, common), detailed)).toBe(true)
            expect(cardMatches(pokemon, outcome({ basicEnergy: true }, common), detailed)).toBe(false)
        })

        test('"any" takes both', () => {
            expect(cardMatches(energy, outcome({ basicEnergy: 'any' }, common), detailed)).toBe(true)
            expect(cardMatches(pokemon, outcome({ basicEnergy: 'any' }, common), detailed)).toBe(true)
        })
    })

    describe('holo and reverse, where card details are trusted', () => {
        const holo = card()
        const plain = card({ variants: { normal: true, reverse: false, holo: false } })
        const reverse = card({ variants: { normal: true, reverse: true, holo: false } })

        test('holo: true keeps the holo cards', () => {
            expect(cardMatches(holo, outcome({ holo: true }), detailed)).toBe(true)
            expect(cardMatches(plain, outcome({ holo: true }), detailed)).toBe(false)
        })

        test('holo: false keeps the cards with a normal print', () => {
            expect(cardMatches(plain, outcome({ holo: false }), detailed)).toBe(true)
            expect(cardMatches(holo, outcome({ holo: false }), detailed)).toBe(false)
        })

        test('reverse: true keeps the cards with a reverse print', () => {
            expect(cardMatches(reverse, outcome({ reverse: true }), detailed)).toBe(true)
            expect(cardMatches(plain, outcome({ reverse: true }), detailed)).toBe(false)
        })

        test('a card without variants is not holo, not reverse, and counts as normal', () => {
            const unknown = card({ variants: null })

            expect(cardMatches(unknown, outcome({ holo: true }), detailed)).toBe(false)
            expect(cardMatches(unknown, outcome({ reverse: true }), detailed)).toBe(false)
            expect(cardMatches(unknown, outcome({ holo: false }), detailed)).toBe(true)
        })
    })

    describe('where card details are not trusted', () => {
        const holo = card({ id: 'sv01-100', suffix: 'ex', boosters: ['boo_x'] })

        test('variants are ignored', () => {
            expect(cardMatches(holo, outcome({ holo: true }), modern)).toBe(false)
            expect(cardMatches(holo, outcome({ holo: false }), modern)).toBe(true)
            expect(cardMatches(holo, outcome({ reverse: true }), modern)).toBe(false)
        })

        test('the suffix is ignored', () => {
            expect(cardMatches(holo, outcome({ suffix: 'ex' }), modern)).toBe(false)
            expect(cardMatches(holo, outcome({ notSuffix: 'ex' }), modern)).toBe(true)
        })

        test('follows the collection the card comes from, not the one opened', () => {
            // ex10 packs borrow from exu, a collection with trusted details...
            const ex10: PoolContext = { ...detailed, setId: 'ex10' }
            expect(cardMatches(holo, outcome({ holo: true }, { set: 'exu' }), ex10)).toBe(true)
            // ...while sv01 packs borrow energies from sve, which has none.
            expect(cardMatches(holo, outcome({ holo: true }, { set: 'sve' }), modern)).toBe(false)
        })
    })

    test('suffix and notSuffix', () => {
        const ex = card({ suffix: 'ex' })

        expect(cardMatches(ex, outcome({ suffix: 'ex' }), detailed)).toBe(true)
        expect(cardMatches(ex, outcome({ suffix: 'EX' }), detailed)).toBe(false)
        expect(cardMatches(card(), outcome({ suffix: 'ex' }), detailed)).toBe(false)
        expect(cardMatches(ex, outcome({ notSuffix: 'ex' }), detailed)).toBe(false)
        expect(cardMatches(card(), outcome({ notSuffix: 'ex' }), detailed)).toBe(true)
    })

    test('name filters', () => {
        const pichu = card({ name: 'Pichu' })
        const mega = card({ name: 'M Charizard-EX' })

        expect(cardMatches(pichu, outcome({ name: ['Pichu', 'Cleffa'] }), detailed)).toBe(true)
        expect(cardMatches(mega, outcome({ name: ['Pichu', 'Cleffa'] }), detailed)).toBe(false)
        expect(cardMatches(mega, outcome({ nameContains: '-EX' }), detailed)).toBe(true)
        expect(cardMatches(pichu, outcome({ nameContains: '-EX' }), detailed)).toBe(false)
        expect(cardMatches(mega, outcome({ nameNotContains: '-EX' }), detailed)).toBe(false)
        expect(cardMatches(pichu, outcome({ nameNotContains: '-EX' }), detailed)).toBe(true)
        expect(cardMatches(mega, outcome({ namePrefix: 'M ' }), detailed)).toBe(true)
        expect(cardMatches(pichu, outcome({ namePrefix: 'M ' }), detailed)).toBe(false)
        expect(cardMatches(mega, outcome({ notNamePrefix: 'M ' }), detailed)).toBe(false)
        expect(cardMatches(pichu, outcome({ notNamePrefix: 'M ' }), detailed)).toBe(true)
    })

    test('card number filters', () => {
        const eight = card({ localId: '8' })
        const ten = card({ localId: '10' })
        const lettered = card({ localId: '28a' })

        expect(cardMatches(eight, outcome({ localId: '8' }), detailed)).toBe(true)
        expect(cardMatches(ten, outcome({ localId: ['8', '9'] }), detailed)).toBe(false)
        expect(cardMatches(eight, outcome({ notLocalId: '8' }), detailed)).toBe(false)
        expect(cardMatches(ten, outcome({ notLocalId: ['8', '9'] }), detailed)).toBe(true)
        expect(cardMatches(eight, outcome({ localIdRange: [8, 9] }), detailed)).toBe(true)
        expect(cardMatches(ten, outcome({ localIdRange: [8, 9] }), detailed)).toBe(false)
        expect(cardMatches(lettered, outcome({ localIdRange: [1, 100] }), detailed)).toBe(false)
    })

    describe('subsets', () => {
        const gallery = card({ localId: 'TG05' })
        const shiny = card({ localId: 'SH3' })
        const main = card({ localId: '12' })
        const excluding: PoolContext = { ...detailed, setId: 'dp7', excludeSubsets: ['SH'] }

        test('subset keeps only that prefix', () => {
            expect(cardMatches(gallery, outcome({ subset: 'TG' }), detailed)).toBe(true)
            expect(cardMatches(main, outcome({ subset: 'TG' }), detailed)).toBe(false)
        })

        test('notSubset drops that prefix', () => {
            expect(cardMatches(gallery, outcome({ notSubset: 'TG' }), detailed)).toBe(false)
            expect(cardMatches(main, outcome({ notSubset: 'TG' }), detailed)).toBe(true)
        })

        test('an excluded subset stays out unless the outcome names a subset', () => {
            expect(cardMatches(shiny, outcome(), excluding)).toBe(false)
            expect(cardMatches(main, outcome(), excluding)).toBe(true)
            expect(cardMatches(shiny, outcome({ subset: 'SH' }), excluding)).toBe(true)
        })

        test('the exclusion does not reach cards borrowed from another collection', () => {
            expect(cardMatches(shiny, outcome(undefined, { set: 'exu' }), excluding)).toBe(true)
            expect(cardMatches(shiny, outcome(undefined, { set: 'dp7' }), excluding)).toBe(false)
        })
    })

    describe('booster', () => {
        const pocket: PoolContext = { setId: 'A1', excludeSubsets: [], setHasBoosterData: true, booster: 'boo_A1-mewtwo' }
        const mewtwo = card({ boosters: ['boo_A1-mewtwo'] })
        const both = card({ boosters: ['boo_A1-mewtwo', 'boo_A1-pikachu'] })
        const pikachu = card({ boosters: ['boo_A1-pikachu'] })
        const none = card({ boosters: [] })

        test('"$booster" means the chosen booster', () => {
            expect(cardMatches(mewtwo, outcome({ booster: '$booster' }), pocket)).toBe(true)
            expect(cardMatches(both, outcome({ booster: '$booster' }), pocket)).toBe(true)
            expect(cardMatches(pikachu, outcome({ booster: '$booster' }), pocket)).toBe(false)
            expect(cardMatches(none, outcome({ booster: '$booster' }), pocket)).toBe(false)
        })

        test('a named booster is used as is', () => {
            expect(cardMatches(pikachu, outcome({ booster: 'boo_A1-pikachu' }), pocket)).toBe(true)
        })

        test('is ignored when the collection has no booster data or no booster is chosen', () => {
            expect(cardMatches(none, outcome({ booster: '$booster' }), { ...pocket, setHasBoosterData: false })).toBe(true)
            expect(cardMatches(none, outcome({ booster: '$booster' }), { ...pocket, booster: null })).toBe(true)
        })
    })

    test('a card must pass every key of the filter', () => {
        const filter: OutcomeFilter = { holo: true, notLocalId: '8' }

        expect(cardMatches(card({ localId: '4' }), outcome(filter), detailed)).toBe(true)
        expect(cardMatches(card({ localId: '8' }), outcome(filter), detailed)).toBe(false)
    })
})

describe('buildPool', () => {
    test('keeps the matching cards, in the order given', () => {
        const cards = [
            card({ id: 'base1-1', localId: '1' }),
            card({ id: 'base1-8', localId: '8' }),
            card({ id: 'base1-17', localId: '17', variants: { normal: true, reverse: false, holo: false } }),
            card({ id: 'base1-2', localId: '2' }),
        ]
        const holoRare = getSetRules('base1')!.slots.find((slot) => slot.id === 'rare')!.outcomes[1]

        expect(buildPool(cards, holoRare, detailed).map((c) => c.id)).toEqual(['base1-1', 'base1-2'])
    })
})

describe('poolContext', () => {
    const withBooster = [card({ boosters: ['boo_A1-mewtwo'] })]
    const without = [card()]

    test('a collection with several boosters uses the one asked for', () => {
        const context = poolContext('A1', getSetRules('A1')!, withBooster, ['boo_A1-mewtwo', 'boo_A1-charizard', 'boo_A1-pikachu'], 'boo_A1-pikachu')

        expect(context).toEqual({ setId: 'A1', excludeSubsets: [], setHasBoosterData: true, booster: 'boo_A1-pikachu' })
    })

    test('and its first one when none is asked for', () => {
        const context = poolContext('A1', getSetRules('A1')!, withBooster, ['boo_A1-mewtwo', 'boo_A1-charizard', 'boo_A1-pikachu'], null)

        expect(context.booster).toBe('boo_A1-mewtwo')
    })

    test('a collection with a single booster always uses it', () => {
        const context = poolContext('A1a', getSetRules('A1a')!, withBooster, ['boo_A1a-mew'], null)

        expect(context.booster).toBe('boo_A1a-mew')
    })

    test('no booster applies when the cards do not say which booster they are in', () => {
        const context = poolContext('B2', getSetRules('B2')!, without, ['boo_B2-booster'], null)

        expect(context).toEqual({ setId: 'B2', excludeSubsets: [], setHasBoosterData: false, booster: null })
    })

    test('a paper collection has no booster and carries its excluded subsets', () => {
        const context = poolContext('dp7', getSetRules('dp7')!, without, [], null)

        expect(context).toEqual({ setId: 'dp7', excludeSubsets: ['SH'], setHasBoosterData: false, booster: null })
    })
})
