import { describe, expect, test } from 'bun:test'
import { WidgetFetchError } from '../types'
import { openPack, pickOutcome, pickPack } from './open-pack'
import type { Random } from './open-pack'
import { getSetRules, openableSetIds } from './rules'
import type { Outcome, SetRules, Slot } from './rules'
import type { TcgCard } from './tcgdex'

/** A random source that plays back a fixed list of numbers, then fails. */
function sequence(...values: number[]): Random & { used: () => number } {
    let index = 0
    const random = () => {
        if (index >= values.length) throw new Error(`random source ran dry after ${values.length} numbers`)
        return values[index++]
    }
    return Object.assign(random, { used: () => index })
}

/** mulberry32: a small seeded generator, so a statistical test gives the same numbers on every run. */
function seeded(seed: number): Random {
    let state = seed
    return () => {
        state = (state + 0x6d2b79f5) | 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function card(id: string, rarity = 'Common'): TcgCard {
    return { id, localId: id, name: id, rarity, suffix: null, basicEnergy: false, image: null, variants: null, boosters: [] }
}

/** A pool of `size` cards named after the outcome's first rarity: "Rare 0", "Rare 1"… */
function poolByRarity(size: number) {
    return (outcome: Outcome) => Array.from({ length: size }, (_, index) => card(`${outcome.rarities[0]} ${index}`, outcome.rarities[0]))
}

function slot(id: string, count: number, outcomes: Partial<Outcome>[]): Slot {
    return {
        id,
        count,
        kind: 'other',
        outcomes: outcomes.map((outcome) => ({ rarities: ['Common'], weight: 1, reverseHolo: false, ...outcome })),
    }
}

function rulesWith(slots: Slot[], extra: Partial<SetRules> = {}): SetRules {
    return {
        confidence: 'high',
        detail: false,
        boosters: [],
        excludeSubsets: [],
        cardsPerPack: slots.reduce((total, each) => total + each.count, 0),
        nonCardContents: [],
        slots,
        variants: [],
        ...extra,
    }
}

describe('pickPack', () => {
    test('a collection without variants gives its base pack and uses no random number', () => {
        const rules = getSetRules('sv01')!
        const random = sequence()

        expect(pickPack(rules, random)).toEqual({ variant: null, pack: rules })
        expect(random.used()).toBe(0)
    })

    // A4: rarePack 0.0005, then babyBonus 0.083258, the base pack takes the rest.
    test.each([
        [0, 'rarePack'],
        [0.00049, 'rarePack'],
        [0.0005, 'babyBonus'],
        [0.08375, 'babyBonus'],
        [0.083758, null],
        [0.5, null],
        [0.999999, null],
    ])('A4 with %p gives %p', (roll, expected) => {
        const picked = pickPack(getSetRules('A4')!, sequence(roll))

        expect(picked.variant).toBe(expected)
        expect(picked.pack.cardsPerPack).toBe(expected === 'babyBonus' ? 6 : 5)
    })
})

describe('pickOutcome', () => {
    const rare = slot('rare', 1, [{ weight: 0.5 }, { weight: 0.3 }, { weight: 0.2 }])

    test.each([
        [0, 0],
        [0.4999, 0],
        [0.5, 1],
        [0.7999, 1],
        [0.8, 2],
        [0.9999, 2],
    ])('%p falls in outcome %p', (roll, expected) => {
        expect(pickOutcome(rare, sequence(roll))).toBe(rare.outcomes[expected])
    })

    test('weights that fall a hair short of 1 still give the last outcome', () => {
        const drifting = slot('rare', 1, [{ weight: 0.3333333 }, { weight: 0.3333333 }, { weight: 0.3333333 }])

        expect(pickOutcome(drifting, sequence(0.99999999))).toBe(drifting.outcomes[2])
    })
})

describe('openPack', () => {
    test('draws the slots in order, each as many times as its count', () => {
        const opened = openPack(getSetRules('sv01')!, poolByRarity(40), seeded(1))

        expect(opened.variant).toBeNull()
        expect(opened.cards.map((drawn) => drawn.slot)).toEqual([
            'common', 'common', 'common', 'common',
            'uncommon', 'uncommon', 'uncommon',
            'reverse1',
            'reverse2',
            'rare',
            'energy',
        ])
        expect(opened.extras).toEqual(['1 Pokémon TCG Live code card'])
    })

    test('uses two random numbers per card: the outcome, then the card', () => {
        const rules = rulesWith([slot('rare', 1, [{ rarities: ['Rare'], weight: 0.75 }, { rarities: ['Ultra Rare'], weight: 0.25 }])])

        // 0.8 → second outcome; 0.5 of a pool of 4 → card 2.
        const random = sequence(0.8, 0.5)
        const opened = openPack(rules, poolByRarity(4), random)

        expect(opened.cards).toEqual([
            { card: card('Ultra Rare 2', 'Ultra Rare'), slot: 'rare', kind: 'other', reverseHolo: false, pattern: null },
        ])
        expect(random.used()).toBe(2)
    })

    test('carries the reverse holo flag and the pattern of the outcome', () => {
        const rules = rulesWith([
            slot('reverse', 1, [
                { weight: 0.9, reverseHolo: true },
                { weight: 0.1, reverseHolo: true, pattern: 'Master Ball' },
            ]),
        ])

        expect(openPack(rules, poolByRarity(3), sequence(0, 0)).cards[0]).toMatchObject({ reverseHolo: true, pattern: null })
        expect(openPack(rules, poolByRarity(3), sequence(0.95, 0)).cards[0]).toMatchObject({ reverseHolo: true, pattern: 'Master Ball' })
    })

    test('a card roll of exactly 1 still lands on the last card', () => {
        const rules = rulesWith([slot('common', 1, [{}])])

        expect(openPack(rules, poolByRarity(3), sequence(0, 1)).cards[0].card.id).toBe('Common 2')
    })

    describe('repeated cards', () => {
        test('a slot never gives the same card twice while its pool has others', () => {
            const rules = rulesWith([slot('common', 4, [{}])])

            // Every roll is 0: without the rule this would be "Common 0" four times.
            const opened = openPack(rules, poolByRarity(5), () => 0)

            expect(opened.cards.map((drawn) => drawn.card.id)).toEqual(['Common 0', 'Common 1', 'Common 2', 'Common 3'])
        })

        test('holds across the outcomes of one slot', () => {
            const shared = [card('a'), card('b')]
            const rules = rulesWith([slot('mixed', 2, [{ weight: 0.5 }, { weight: 0.5 }])])

            // First card from outcome 0, second from outcome 1, both pools holding the same cards.
            const opened = openPack(rules, () => shared, sequence(0, 0, 0.9, 0))

            expect(opened.cards.map((drawn) => drawn.card.id)).toEqual(['a', 'b'])
        })

        test('a pool smaller than the slot repeats once it is used up', () => {
            const rules = rulesWith([slot('card', 3, [{}])])

            const opened = openPack(rules, poolByRarity(2), () => 0)

            expect(opened.cards.map((drawn) => drawn.card.id)).toEqual(['Common 0', 'Common 1', 'Common 0'])
        })

        test('two different slots may give the same card', () => {
            const rules = rulesWith([slot('common', 1, [{}]), slot('reverse', 1, [{ reverseHolo: true }])])

            const opened = openPack(rules, poolByRarity(5), () => 0)

            expect(opened.cards.map((drawn) => [drawn.card.id, drawn.reverseHolo])).toEqual([
                ['Common 0', false],
                ['Common 0', true],
            ])
        })

        test('1000 packs of sv01 never repeat a common or an uncommon inside its slot', () => {
            const random = seeded(7)
            const rules = getSetRules('sv01')!

            for (let pack = 0; pack < 1000; pack++) {
                const opened = openPack(rules, poolByRarity(6), random)
                for (const slotId of ['common', 'uncommon']) {
                    const ids = opened.cards.filter((drawn) => drawn.slot === slotId).map((drawn) => drawn.card.id)
                    expect(new Set(ids).size).toBe(ids.length)
                }
            }
        })
    })

    test('an outcome without any card is an upstream error', () => {
        const rules = rulesWith([slot('common', 1, [{}])])

        expect(() => openPack(rules, () => [], () => 0)).toThrow(WidgetFetchError)
        try {
            openPack(rules, () => [], () => 0)
        } catch (error) {
            expect((error as WidgetFetchError).code).toBe('upstream_error')
        }
    })

    test('a variant replaces the whole pack', () => {
        // 0.0001 picks A4's rare pack: one slot of five cards.
        const random = seeded(3)
        let first = true
        const opened = openPack(getSetRules('A4')!, poolByRarity(30), () => {
            if (first) {
                first = false
                return 0.0001
            }
            return random()
        })

        expect(opened.variant).toBe('rarePack')
        expect(opened.cards).toHaveLength(5)
        expect(new Set(opened.cards.map((drawn) => drawn.slot)).size).toBe(1)
    })

    test.each(openableSetIds())('%s: a pack holds as many cards as its rules say', (setId) => {
        const rules = getSetRules(setId)!
        const random = seeded(11)

        for (let pack = 0; pack < 20; pack++) {
            const opened = openPack(rules, poolByRarity(12), random)
            const expected = opened.variant
                ? rules.variants.find((variant) => variant.id === opened.variant)!.cardsPerPack
                : rules.cardsPerPack
            expect(opened.cards).toHaveLength(expected)
        }
    })
})

describe('odds over many packs', () => {
    const PACKS = 200_000

    function share(count: number): number {
        return count / PACKS
    }

    test('sv01: the second reverse slot is an Illustration rare or better about 12.67 % of the time', () => {
        const rules = getSetRules('sv01')!
        const random = seeded(2026)
        let hits = 0

        for (let pack = 0; pack < PACKS; pack++) {
            const reverse2 = openPack(rules, poolByRarity(10), random).cards.find((drawn) => drawn.slot === 'reverse2')!
            if (!reverse2.reverseHolo) hits++
        }

        expect(share(hits)).toBeGreaterThan(0.1237)
        expect(share(hits)).toBeLessThan(0.1297)
    })

    test('base1: the rare is holo one time in three', () => {
        const rules = getSetRules('base1')!
        const holoRare = rules.slots.find((each) => each.id === 'rare')!.outcomes[1]
        const random = seeded(1999)
        let holos = 0

        for (let pack = 0; pack < PACKS; pack++) {
            const opened = openPack(rules, (outcome) => [card(outcome === holoRare ? 'holo' : 'plain')], random)
            if (opened.cards.at(-1)!.card.id === 'holo') holos++
        }

        expect(share(holos)).toBeGreaterThan(0.3283)
        expect(share(holos)).toBeLessThan(0.3383)
    })

    test('A4: the six-card pack comes about 8.33 % of the time', () => {
        const rules = getSetRules('A4')!
        const random = seeded(4)
        let bonus = 0

        for (let pack = 0; pack < PACKS; pack++) {
            if (openPack(rules, poolByRarity(10), random).variant === 'babyBonus') bonus++
        }

        expect(share(bonus)).toBeGreaterThan(0.0803)
        expect(share(bonus)).toBeLessThan(0.0863)
    })
})
