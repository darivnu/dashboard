import { describe, expect, test } from 'bun:test'
import type { HttpClient } from '../types'
import { WidgetFetchError } from '../types'
import { fetchSetCards, fetchSets, imageUrls, logoUrl } from './tcgdex'

interface Call {
    url: string
    method: string | undefined
    contentType: string | null
    query: string
    variables: Record<string, any>
}

/** An HttpClient that answers from a script and records what it was asked. */
function stubHttp(reply: (call: Call) => unknown) {
    const calls: Call[] = []
    const http: HttpClient = {
        async json<T>(url: string, init?: RequestInit): Promise<T> {
            const body = JSON.parse(String(init?.body ?? '{}'))
            const call: Call = {
                url,
                method: init?.method,
                contentType: new Headers(init?.headers).get('content-type'),
                query: body.query ?? '',
                variables: body.variables ?? {},
            }
            calls.push(call)
            return reply(call) as T
        },
    }
    return { http, calls }
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
    try {
        await promise
    } catch (error) {
        if (error instanceof WidgetFetchError) return error.code
        throw error
    }
    return 'no error'
}

function rawCard(overrides: Record<string, unknown> = {}) {
    return {
        id: 'sv01-001',
        localId: '001',
        name: 'Pineco',
        rarity: 'Common',
        category: 'Pokemon',
        suffix: null,
        energyType: null,
        image: 'https://assets.tcgdex.net/en/sv/sv01/001',
        set: { id: 'sv01' },
        variants: { normal: true, reverse: true, holo: false },
        boosters: null,
        ...overrides,
    }
}

function rawSet(overrides: Record<string, unknown> = {}) {
    return {
        id: 'sv01',
        name: 'Scarlet & Violet',
        logo: 'https://assets.tcgdex.net/en/sv/sv01/logo',
        serie: { id: 'sv', name: 'Scarlet & Violet' },
        boosters: null,
        ...overrides,
    }
}

describe('imageUrls', () => {
    test('adds the quality and the format TCGdex expects', () => {
        expect(imageUrls('https://assets.tcgdex.net/en/sv/sv01/001')).toEqual({
            low: 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp',
            high: 'https://assets.tcgdex.net/en/sv/sv01/001/high.webp',
        })
    })

    test.each([null, undefined, '', 42, 'http://assets.tcgdex.net/x', 'javascript:alert(1)', '//assets.tcgdex.net/x'])(
        'is null for %p',
        (image) => {
            expect(imageUrls(image)).toBeNull()
        },
    )
})

describe('logoUrl', () => {
    test('adds the format', () => {
        expect(logoUrl('https://assets.tcgdex.net/en/sv/sv01/logo')).toBe(
            'https://assets.tcgdex.net/en/sv/sv01/logo.webp',
        )
    })

    test.each([null, undefined, 'http://assets.tcgdex.net/logo', 7])('is null for %p', (logo) => {
        expect(logoUrl(logo)).toBeNull()
    })
})

describe('fetchSets', () => {
    test('asks the GraphQL endpoint once, as a JSON POST', async () => {
        const { http, calls } = stubHttp(() => ({ data: { sets: [] } }))

        await fetchSets(http)

        expect(calls).toHaveLength(1)
        expect(calls[0].url).toBe('https://api.tcgdex.net/v2/graphql')
        expect(calls[0].method).toBe('POST')
        expect(calls[0].contentType).toBe('application/json')
        expect(calls[0].query).toContain('sets')
    })

    test('cleans each collection', async () => {
        const { http } = stubHttp(() => ({
            data: {
                sets: [
                    rawSet(),
                    rawSet({
                        id: 'A1',
                        name: ' Genetic Apex ',
                        logo: null,
                        serie: { id: 'tcgp', name: 'Pokémon TCG Pocket' },
                        boosters: [
                            { id: 'boo_A1-mewtwo', name: 'Mewtwo' },
                            { id: 'boo_A1-charizard', name: 'Charizard' },
                            { id: 7, name: 'broken' },
                        ],
                    }),
                ],
            },
        }))

        expect(await fetchSets(http)).toEqual([
            {
                id: 'sv01',
                name: 'Scarlet & Violet',
                serie: { id: 'sv', name: 'Scarlet & Violet' },
                logo: 'https://assets.tcgdex.net/en/sv/sv01/logo.webp',
                boosters: [],
            },
            {
                id: 'A1',
                name: 'Genetic Apex',
                serie: { id: 'tcgp', name: 'Pokémon TCG Pocket' },
                logo: null,
                boosters: [
                    { id: 'boo_A1-mewtwo', name: 'Mewtwo' },
                    { id: 'boo_A1-charizard', name: 'Charizard' },
                ],
            },
        ])
    })

    test('leaves out a collection without an id, a name or a serie', async () => {
        const { http } = stubHttp(() => ({
            data: {
                sets: [rawSet({ id: 5 }), rawSet({ name: '   ' }), rawSet({ serie: null }), null, 'x', rawSet()],
            },
        }))

        expect((await fetchSets(http)).map((set) => set.id)).toEqual(['sv01'])
    })

    test.each([
        ['null', null],
        ['a string', 'nope'],
        ['no data', {}],
        ['sets not an array', { data: { sets: {} } }],
        ['GraphQL errors', { errors: [{ message: 'boom' }], data: { sets: [] } }],
    ])('answers upstream_error for %s', async (_label, body) => {
        const { http } = stubHttp(() => body)

        expect(await codeOf(fetchSets(http))).toBe('upstream_error')
    })

    test('lets a rate limit from the upstream through', async () => {
        const { http } = stubHttp(() => {
            throw new WidgetFetchError('rate_limited', '429')
        })

        expect(await codeOf(fetchSets(http))).toBe('rate_limited')
    })
})

describe('fetchSetCards', () => {
    test('asks for the cards whose id starts with the collection id', async () => {
        const { http, calls } = stubHttp(() => ({ data: { cards: [rawCard()] } }))

        await fetchSetCards(http, 'sv01')

        expect(calls).toHaveLength(1)
        expect(calls[0].url).toBe('https://api.tcgdex.net/v2/graphql')
        expect(calls[0].method).toBe('POST')
        expect(calls[0].variables).toEqual({
            filters: { id: 'sv01-' },
            pagination: { page: 1, itemsPerPage: 250 },
        })
        for (const field of ['id', 'localId', 'name', 'rarity', 'category', 'suffix', 'energyType', 'image', 'set', 'variants', 'boosters']) {
            expect(calls[0].query).toContain(field)
        }
    })

    test('never writes the collection id into the query text', async () => {
        const { http, calls } = stubHttp(() => ({ data: { cards: [] } }))

        await fetchSetCards(http, 'sv03.5')

        expect(calls[0].query).not.toContain('sv03.5')
    })

    test('cleans each card', async () => {
        const { http } = stubHttp(() => ({
            data: {
                cards: [
                    rawCard(),
                    rawCard({
                        id: 'sv01-257',
                        localId: '257',
                        name: 'Basic Grass Energy',
                        rarity: 'Hyper rare',
                        category: 'Energy',
                        energyType: 'Normal',
                        image: null,
                        variants: null,
                        suffix: 'ex',
                        boosters: [{ id: 'boo_x', name: 'X' }, { id: 3 }, null],
                    }),
                ],
            },
        }))

        expect(await fetchSetCards(http, 'sv01')).toEqual([
            {
                id: 'sv01-001',
                localId: '001',
                name: 'Pineco',
                rarity: 'Common',
                suffix: null,
                basicEnergy: false,
                image: {
                    low: 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp',
                    high: 'https://assets.tcgdex.net/en/sv/sv01/001/high.webp',
                },
                variants: { normal: true, reverse: true, holo: false },
                boosters: [],
            },
            {
                id: 'sv01-257',
                localId: '257',
                name: 'Basic Grass Energy',
                rarity: 'Hyper rare',
                suffix: 'ex',
                basicEnergy: true,
                image: null,
                variants: null,
                boosters: ['boo_x'],
            },
        ])
    })

    test.each([
        ['Grass Energy', 'Normal', true],
        ['Basic Fairy Energy', 'Normal', true],
        ['Darkness Energy', 'Special', false],
        ['Double Colorless Energy', 'Normal', false],
        ['Rainbow Energy', 'Special', false],
        ['Grass Energy', null, false],
        ['Team Aqua Energy', 'Normal', false],
    ])('%s (%p) is a basic energy: %p', async (name, energyType, expected) => {
        const { http } = stubHttp(() => ({ data: { cards: [rawCard({ name, energyType, category: 'Energy' })] } }))

        const [card] = await fetchSetCards(http, 'sv01')

        expect(card.basicEnergy).toBe(expected)
    })

    test('drops the cards of another collection the filter also matched', async () => {
        const { http } = stubHttp(() => ({
            data: {
                cards: [rawCard(), rawCard({ id: 'xsv01-001', set: { id: 'xsv01' } }), rawCard({ id: 'sv01-002', set: null })],
            },
        }))

        expect((await fetchSetCards(http, 'sv01')).map((card) => card.id)).toEqual(['sv01-001'])
    })

    test('reads pages until one is not full', async () => {
        const fullPage = Array.from({ length: 250 }, (_, index) => rawCard({ id: `sv01-${index}`, localId: String(index) }))
        const { http, calls } = stubHttp((call) => ({
            data: { cards: call.variables.pagination.page === 1 ? fullPage : [rawCard({ id: 'sv01-last' })] },
        }))

        const cards = await fetchSetCards(http, 'sv01')

        expect(calls.map((call) => call.variables.pagination.page)).toEqual([1, 2])
        expect(cards).toHaveLength(251)
        expect(cards[250].id).toBe('sv01-last')
    })

    test('stops after ten pages even if the upstream never ends', async () => {
        const fullPage = Array.from({ length: 250 }, () => rawCard())
        const { http, calls } = stubHttp(() => ({ data: { cards: fullPage } }))

        expect(await codeOf(fetchSetCards(http, 'sv01'))).toBe('upstream_error')
        expect(calls).toHaveLength(10)
    })

    test('answers an empty list for a collection without cards', async () => {
        const { http } = stubHttp(() => ({ data: { cards: [] } }))

        expect(await fetchSetCards(http, 'sv01')).toEqual([])
    })

    test.each([
        ['null', null],
        ['no data', { nope: true }],
        ['cards not an array', { data: { cards: 'x' } }],
        ['GraphQL errors', { errors: [{ message: 'Cannot query field' }] }],
        ['a card that is not an object', { data: { cards: [42] } }],
        ['a card without an id', { data: { cards: [rawCard({ id: null })] } }],
        ['a card without a local id', { data: { cards: [rawCard({ localId: 12 })] } }],
        ['a card without a name', { data: { cards: [rawCard({ name: undefined })] } }],
        ['a card without a rarity', { data: { cards: [rawCard({ rarity: null })] } }],
    ])('answers upstream_error for %s', async (_label, body) => {
        const { http } = stubHttp(() => body)

        expect(await codeOf(fetchSetCards(http, 'sv01'))).toBe('upstream_error')
    })
})
