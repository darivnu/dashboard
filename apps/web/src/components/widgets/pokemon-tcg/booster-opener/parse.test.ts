import { expect, test } from 'vitest'
import { parseBoosterOpener, parsePack } from './parse'

const sv01 = {
    id: 'sv01',
    name: 'Scarlet & Violet',
    serie: { id: 'sv', name: 'Scarlet & Violet' },
    logo: 'https://assets.tcgdex.net/en/sv/sv01/logo.webp',
    cardsPerPack: 11,
    confidence: 'medium',
    boosters: [],
}

const a1 = {
    id: 'A1',
    name: 'Genetic Apex',
    serie: { id: 'tcgp', name: 'Pokémon TCG Pocket' },
    logo: null,
    cardsPerPack: 5,
    confidence: 'high',
    boosters: [
        { id: 'boo_A1-mewtwo', name: 'Mewtwo' },
        { id: 'boo_A1-pikachu', name: 'Pikachu' },
    ],
}

const card = {
    id: 'sv01-001',
    name: 'Pineco',
    rarity: 'Common',
    image: {
        low: 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp',
        high: 'https://assets.tcgdex.net/en/sv/sv01/001/high.webp',
    },
    slot: 'common',
    kind: 'common',
    reverseHolo: false,
    pattern: null,
}

const energy = {
    ...card,
    id: 'sve-001',
    name: 'Basic Grass Energy',
    image: null,
    slot: 'energy',
    kind: 'energy',
}

const pack = {
    set: { id: 'sv01', name: 'Scarlet & Violet' },
    booster: null,
    variant: null,
    cards: [
        card,
        { ...card, reverseHolo: true, pattern: 'Master Ball' },
        energy,
    ],
    extras: ['1 Pokémon TCG Live code card'],
}

test('accepts a list of collections', () => {
    const data = { sets: [sv01, a1] }
    expect(parseBoosterOpener(data)).toEqual(data)
})

test('accepts an empty list of collections', () => {
    expect(parseBoosterOpener({ sets: [] })).toEqual({ sets: [] })
})

test('keeps only the documented fields of a collection', () => {
    const parsed = parseBoosterOpener({
        sets: [{ ...sv01, extra: 'ignored', serie: { ...sv01.serie, x: 1 } }],
    })
    expect(parsed).toEqual({ sets: [sv01] })
})

test.each([
    ['null', null],
    ['a string', 'sets'],
    ['a list', [sv01]],
    ['no sets', {}],
    ['sets that are not a list', { sets: sv01 }],
    ['a collection that is not an object', { sets: ['sv01'] }],
    ['a collection without an id', { sets: [{ ...sv01, id: '' }] }],
    ['a collection without a name', { sets: [{ ...sv01, name: 12 }] }],
    ['a collection without a serie', { sets: [{ ...sv01, serie: null }] }],
    ['a serie without a name', { sets: [{ ...sv01, serie: { id: 'sv' } }] }],
    [
        'a logo that is not https',
        { sets: [{ ...sv01, logo: 'http://assets.tcgdex.net/logo.webp' }] },
    ],
    [
        'a logo that would run code',
        { sets: [{ ...sv01, logo: 'javascript:alert(1)' }] },
    ],
    ['a missing logo', { sets: [{ ...sv01, logo: undefined }] }],
    ['cards per pack as text', { sets: [{ ...sv01, cardsPerPack: '11' }] }],
    ['cards per pack at zero', { sets: [{ ...sv01, cardsPerPack: 0 }] }],
    [
        'cards per pack with decimals',
        { sets: [{ ...sv01, cardsPerPack: 5.5 }] },
    ],
    ['an unknown confidence', { sets: [{ ...sv01, confidence: 'certain' }] }],
    ['boosters that are not a list', { sets: [{ ...a1, boosters: null }] }],
    [
        'a booster without a name',
        { sets: [{ ...a1, boosters: [{ id: 'boo_A1-mewtwo' }] }] },
    ],
])('refuses %s as collections', (_label, raw) => {
    expect(() => parseBoosterOpener(raw)).toThrow(
        'Unexpected booster opener data',
    )
})

test('accepts an opened pack', () => {
    expect(parsePack(pack)).toEqual(pack)
})

test('accepts a pack with a booster, a variant and nothing besides cards', () => {
    const pocket = {
        ...pack,
        booster: 'boo_A1-mewtwo',
        variant: 'rarePack',
        extras: [],
    }
    expect(parsePack(pocket)).toEqual(pocket)
})

test('keeps only the documented fields of a card', () => {
    const parsed = parsePack({
        ...pack,
        cards: [{ ...card, hp: 60, image: { ...card.image, medium: 'x' } }],
    })
    expect(parsed.cards).toEqual([card])
})

test.each([
    ['null', null],
    ['a list', [pack]],
    ['no collection', { ...pack, set: undefined }],
    ['a collection without a name', { ...pack, set: { id: 'sv01' } }],
    ['a booster that is a number', { ...pack, booster: 3 }],
    ['a missing variant', { ...pack, variant: undefined }],
    ['cards that are not a list', { ...pack, cards: card }],
    ['no card at all', { ...pack, cards: [] }],
    ['a card that is not an object', { ...pack, cards: ['sv01-001'] }],
    ['a card without an id', { ...pack, cards: [{ ...card, id: '' }] }],
    ['a card without a name', { ...pack, cards: [{ ...card, name: null }] }],
    ['a card without a rarity', { ...pack, cards: [{ ...card, rarity: 1 }] }],
    ['a card without a slot', { ...pack, cards: [{ ...card, slot: '' }] }],
    ['a card without a kind', { ...pack, cards: [{ ...card, kind: null }] }],
    [
        'a reverse holo flag that is text',
        { ...pack, cards: [{ ...card, reverseHolo: 'true' }] },
    ],
    [
        'a pattern that is a number',
        { ...pack, cards: [{ ...card, pattern: 1 }] },
    ],
    [
        'an image that is plain text',
        { ...pack, cards: [{ ...card, image: card.image.low }] },
    ],
    [
        'an image missing a size',
        { ...pack, cards: [{ ...card, image: { low: card.image.low } }] },
    ],
    [
        'an image that is not https',
        {
            ...pack,
            cards: [
                {
                    ...card,
                    image: { ...card.image, high: 'http://x/high.webp' },
                },
            ],
        },
    ],
    [
        'an image that would run code',
        {
            ...pack,
            cards: [
                {
                    ...card,
                    image: { ...card.image, low: 'javascript:alert(1)' },
                },
            ],
        },
    ],
    ['extras that are not a list', { ...pack, extras: 'code card' }],
    ['an extra that is not text', { ...pack, extras: [1] }],
])('refuses %s as a pack', (_label, raw) => {
    expect(() => parsePack(raw)).toThrow('Unexpected pack data')
})
