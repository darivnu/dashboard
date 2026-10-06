import { describe, expect, test } from 'bun:test'
import { getSetRules, hasCardDetails, openableSetIds } from './rules'
import type { Pack } from './rules'

const WEIGHT_TOLERANCE = 1e-6

/** The base pack of a collection followed by its whole-pack variants. */
function packsOf(setId: string): Pack[] {
    const rules = getSetRules(setId)
    if (!rules) throw new Error(`no rules for ${setId}`)
    return [rules, ...rules.variants]
}

describe('pack rules file', () => {
    test('holds the 152 collections sold as booster packs', () => {
        expect(openableSetIds()).toHaveLength(152)
    })

    test('splits them by confidence as the rules project does', () => {
        const counts = { high: 0, medium: 0, low: 0 }
        for (const id of openableSetIds()) counts[getSetRules(id)!.confidence]++

        expect(counts).toEqual({ high: 11, medium: 107, low: 34 })
    })

    test('keeps the collections in release order, oldest first', () => {
        expect(openableSetIds()[0]).toBe('base1')
    })

    test.each(openableSetIds())('%s: slot counts add up to the cards per pack', (setId) => {
        for (const pack of packsOf(setId)) {
            const cards = pack.slots.reduce((total, slot) => total + slot.count, 0)
            expect(cards).toBe(pack.cardsPerPack)
        }
    })

    test.each(openableSetIds())('%s: the weights of every slot add up to 1', (setId) => {
        for (const pack of packsOf(setId)) {
            for (const slot of pack.slots) {
                const total = slot.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)
                expect(Math.abs(total - 1)).toBeLessThan(WEIGHT_TOLERANCE)
            }
        }
    })

    test.each(openableSetIds())('%s: every outcome names at least one rarity', (setId) => {
        for (const pack of packsOf(setId)) {
            for (const slot of pack.slots) {
                expect(slot.outcomes.length).toBeGreaterThan(0)
                for (const outcome of slot.outcomes) {
                    expect(outcome.rarities.length).toBeGreaterThan(0)
                    expect(outcome.weight).toBeGreaterThan(0)
                }
            }
        }
    })

    test.each(openableSetIds())('%s: variants leave room for the base pack', (setId) => {
        const { variants } = getSetRules(setId)!
        const total = variants.reduce((sum, variant) => sum + variant.probability, 0)

        for (const variant of variants) expect(variant.probability).toBeGreaterThan(0)
        expect(total).toBeLessThan(1)
    })

    test('what else is in a pack is worded for the person opening it', () => {
        const texts = new Set<string>()
        for (const id of openableSetIds()) {
            for (const pack of packsOf(id)) for (const text of pack.nonCardContents) texts.add(text)
        }

        expect([...texts].sort()).toEqual([
            '1 Pokémon TCG Live code card',
            '1 Pokémon TCG Online / Live code card',
            '1 Pokémon TCG Online code card',
            '1 advertisement or tips card',
            '1 basic Energy card',
            '1 code card',
            '1 foil basic Energy card',
        ])
    })

    test('only five collections let the user choose a booster', () => {
        const multi = openableSetIds().filter((id) => getSetRules(id)!.boosters.length > 0)

        expect(multi).toEqual(['A1', 'A2', 'A3', 'A4', 'B1'])
        expect(getSetRules('A1')!.boosters).toEqual(['boo_A1-mewtwo', 'boo_A1-charizard', 'boo_A1-pikachu'])
        expect(getSetRules('A1a')!.boosters).toEqual([])
    })
})

describe('getSetRules', () => {
    test('returns the pack of a known collection', () => {
        const rules = getSetRules('sv01')

        expect(rules?.cardsPerPack).toBe(11)
        expect(rules?.slots.map((slot) => `${slot.id} x${slot.count}`)).toEqual([
            'common x4',
            'uncommon x3',
            'reverse1 x1',
            'reverse2 x1',
            'rare x1',
            'energy x1',
        ])
        expect(rules?.nonCardContents).toEqual(['1 Pokémon TCG Live code card'])
    })

    test('keeps the filter and the source collection of an outcome', () => {
        const energy = getSetRules('sv01')!.slots.find((slot) => slot.id === 'energy')!

        expect(energy.outcomes).toEqual([
            { rarities: ['Common'], weight: 1, reverseHolo: false, filter: { basicEnergy: true }, set: 'sve' },
        ])
    })

    test('knows the whole-pack variants of a TCG Pocket collection', () => {
        const variants = getSetRules('A4')!.variants

        expect(variants.map((variant) => variant.id)).toEqual(['rarePack', 'babyBonus'])
        expect(variants[1].cardsPerPack).toBe(6)
    })

    test.each(['nope', '', 'SV01', 'sve', 'constructor', '__proto__', 'toString'])(
        'returns undefined for "%s"',
        (setId) => {
            expect(getSetRules(setId)).toBeUndefined()
        },
    )
})

describe('hasCardDetails', () => {
    test.each([
        ['base1', true],
        ['ex10', true],
        ['A1', true],
        ['exu', true],
        ['sv01', false],
        ['swsh9', false],
        ['sve', false],
        ['swsh9tg', false],
        ['nope', false],
        ['constructor', false],
    ])('%s: %p', (setId, expected) => {
        expect(hasCardDetails(setId)).toBe(expected)
    })

    test('every collection an outcome borrows cards from is known', () => {
        for (const id of openableSetIds()) {
            const rules = getSetRules(id)!
            for (const pack of [rules, ...rules.variants]) {
                for (const slot of pack.slots) {
                    for (const outcome of slot.outcomes) {
                        if (!outcome.set || getSetRules(outcome.set)) continue
                        expect(['exu', 'sma', 'swsh4.5sv', 'cel25cc', 'swsh9tg', 'swsh10tg', 'swsh11tg', 'swsh12tg', 'swsh12.5gg', 'sve', 'mee', '30th-c']).toContain(outcome.set)
                    }
                }
            }
        }
    })
})
