import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { createTtlCache } from '../lib/cache'
import { createFixedWindowLimiter } from '../lib/rate-limit'
import { aboutRoutes } from '../modules/about/about.routes'
import { createActionsService, RateLimitedError } from '../modules/actions/actions.service'
import { createFakeRepo, noOAuthTokens } from '../modules/dashboard/dashboard.fakes'
import { createDashboardService } from '../modules/dashboard/dashboard.service'
import { createDataService } from '../modules/dashboard/data.service'
import type { CachedWidgetData } from '../modules/dashboard/data.service'
import { createFakeSubscriptionsRepo } from '../modules/subscriptions/subscriptions.fakes'
import { __resetCardStoreForTests } from './pokemon-tcg/card-store'
import { openableSetIds } from './pokemon-tcg/rules'
import { registerServices } from './register'
import { __resetRegistryForTests, registry } from './registry'
import type { HttpClient } from './types'
import { WidgetFetchError } from './types'

// Exercises pokemon_tcg through the services the HTTP routes call: the data
// endpoint for the widget and the action runner for `open_pack`, with an
// in-memory repo and a stubbed HttpClient. No test reaches the network.

const ALICE = 'user-alice'
const GRAPHQL_URL = 'https://api.tcgdex.net/v2/graphql'

type Raw = Record<string, unknown>

interface RecordedCall {
    url: string
    method: string | undefined
    /** 'sets' for the collection list, otherwise the collection whose cards were asked for. */
    target: string
}

function rawSet(id: string, name: string, serie: [string, string], boosters: [string, string][] | null = null): Raw {
    return {
        id,
        name,
        logo: `https://assets.tcgdex.net/en/${serie[0]}/${id}/logo`,
        serie: { id: serie[0], name: serie[1] },
        boosters: boosters?.map(([boosterId, boosterName]) => ({ id: boosterId, name: boosterName })) ?? null,
    }
}

let cardNumber = 0

/** `count` upstream cards of one rarity in one collection. */
function rawCards(setId: string, rarity: string, count: number, overrides: Raw = {}): Raw[] {
    return Array.from({ length: count }, () => {
        cardNumber += 1
        const localId = String(cardNumber)
        return {
            id: `${setId}-${localId}`,
            localId,
            name: `${rarity} ${localId}`,
            rarity,
            category: 'Pokemon',
            suffix: null,
            energyType: null,
            image: `https://assets.tcgdex.net/en/x/${setId}/${localId}`,
            set: { id: setId },
            variants: { normal: true, reverse: true, holo: false },
            boosters: null,
            ...overrides,
        }
    })
}

function rawEnergies(setId: string, count: number): Raw[] {
    const types = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting']
    return rawCards(setId, 'Common', count, { category: 'Energy', energyType: 'Normal' }).map((card, index) => ({
        ...card,
        name: `${types[index % types.length]} Energy`,
    }))
}

const SV_RARITIES = ['Common', 'Uncommon', 'Rare', 'Double rare', 'Ultra Rare', 'Illustration rare', 'Special illustration rare', 'Hyper rare']
const POCKET_RARITIES = ['One Diamond', 'Two Diamond', 'Three Diamond', 'Four Diamond', 'One Star', 'Two Star', 'Three Star', 'Crown']

/** A small but complete upstream: enough cards of every rarity the three collections draw. */
function upstream(): { sets: Raw[]; cards: Record<string, Raw[]> } {
    const mewtwo = { boosters: [{ id: 'boo_A1-mewtwo' }] }
    const pikachu = { boosters: [{ id: 'boo_A1-pikachu' }] }
    return {
        sets: [
            rawSet('miscp', 'Miscellaneous Promos', ['misc', 'Miscellaneous']),
            rawSet('A1', 'Genetic Apex', ['tcgp', 'Pokémon TCG Pocket'], [
                ['boo_A1-mewtwo', 'Mewtwo'],
                ['boo_A1-charizard', 'Charizard'],
                ['boo_A1-pikachu', 'Pikachu'],
            ]),
            rawSet('A1a', 'Mythical Island', ['tcgp', 'Pokémon TCG Pocket'], [['boo_A1a-mew', 'Mew']]),
            rawSet('sv01', 'Scarlet & Violet', ['sv', 'Scarlet & Violet']),
            rawSet('sve', 'Scarlet & Violet Energy', ['sv', 'Scarlet & Violet']),
            rawSet('base1', 'Base Set', ['base', 'Base']),
        ],
        cards: {
            sv01: SV_RARITIES.flatMap((rarity) => rawCards('sv01', rarity, 8)),
            sve: rawEnergies('sve', 6).map((card) => ({ ...card, image: null })),
            base1: [
                ...rawCards('base1', 'Common', 8),
                ...rawEnergies('base1', 6),
                ...rawCards('base1', 'Uncommon', 8),
                ...rawCards('base1', 'Rare', 6),
                ...rawCards('base1', 'Rare', 6, { variants: { normal: false, reverse: false, holo: true } }),
            ],
            A1: [
                ...POCKET_RARITIES.flatMap((rarity) => rawCards('A1', rarity, 6, mewtwo)),
                ...POCKET_RARITIES.flatMap((rarity) => rawCards('A1', rarity, 6, pikachu)),
            ],
        },
    }
}

function createStubHttp() {
    const calls: RecordedCall[] = []
    let world = upstream()
    let failure: (() => unknown) | null = null

    const http: HttpClient = {
        async json<T>(url: string, init?: RequestInit): Promise<T> {
            const body = JSON.parse(String(init?.body))
            const filter: string | undefined = body.variables?.filters?.id
            const target = filter ? filter.slice(0, -1) : 'sets'
            calls.push({ url, method: init?.method, target })

            if (failure) return failure() as T
            if (target === 'sets') return { data: { sets: world.sets } } as T
            return { data: { cards: world.cards[target] ?? [] } } as T
        },
    }

    return {
        http,
        calls,
        targets: () => calls.map((call) => call.target),
        /** The upstream row of a card, to check what the pack was drawn from. */
        rawCard(setId: string, cardId: string): Raw | undefined {
            return world.cards[setId]?.find((card) => card.id === cardId)
        },
        change(edit: (current: ReturnType<typeof upstream>) => void) {
            edit(world)
        },
        /** Every request from now on answers (or throws) what `next` does. */
        failWith(next: (() => unknown) | null) {
            failure = next
        },
    }
}

let stub: ReturnType<typeof createStubHttp>
let dashboard: ReturnType<typeof createDashboardService>
let data: ReturnType<typeof createDataService>
let actions: ReturnType<typeof createActionsService>
let clock = 0

beforeEach(() => {
    __resetRegistryForTests()
    registerServices('development')
    __resetCardStoreForTests()
    cardNumber = 0
    clock = 0

    stub = createStubHttp()
    const repo = createFakeRepo()
    dashboard = createDashboardService(repo)
    data = createDataService({
        repo,
        subscriptions: createFakeSubscriptionsRepo(),
        http: stub.http,
        tokens: noOAuthTokens,
        cache: createTtlCache<CachedWidgetData>(),
    })
    actions = createActionsService({ http: stub.http, limiter: createFixedWindowLimiter({ now: () => clock }) })
})

interface PackSetOut {
    id: string
    name: string
    serie: { id: string; name: string }
    logo: string | null
    cardsPerPack: number
    confidence: string
    boosters: { id: string; name: string }[]
}

interface PackOut {
    set: { id: string; name: string }
    booster: string | null
    variant: string | null
    cards: {
        id: string
        name: string
        rarity: string
        image: { low: string; high: string } | null
        slot: string
        kind: string
        reverseHolo: boolean
        pattern: string | null
    }[]
    extras: string[]
}

async function fetchWidget(params: Record<string, unknown> = {}) {
    const instance = await dashboard.create(ALICE, { serviceId: 'pokemon_tcg', widgetId: 'booster_opener', params })
    return data.getInstanceData(ALICE, instance.id)
}

async function fetchSetList(params: Record<string, unknown> = {}): Promise<PackSetOut[]> {
    const result = await fetchWidget(params)
    if (!result.ok) throw new Error(`expected ok: true, got code "${result.code}"`)
    return (result.data as { sets: PackSetOut[] }).sets
}

function runOpen(params: Record<string, unknown>, user = ALICE) {
    return actions.runAction(user, 'pokemon_tcg', 'open_pack', params)
}

async function open(params: Record<string, unknown>): Promise<PackOut> {
    const result = await runOpen(params)
    if (!result.ok) throw new Error(`expected ok: true, got code "${result.code}"`)
    return result.data as PackOut
}

describe('registration', () => {
    test.each(['production', 'development'])('with NODE_ENV=%j pokemon_tcg has the booster_opener widget and the open_pack action', (nodeEnv) => {
        __resetRegistryForTests()
        registerServices(nodeEnv)

        const service = registry.getService('pokemon_tcg')
        expect(service?.name).toBe('Pokémon TCG')
        expect(service?.auth).toEqual({ kind: 'none' })
        expect(service?.widgets.map((widget) => widget.id)).toEqual(['booster_opener'])
        expect(service?.actions?.map((action) => action.id)).toEqual(['open_pack'])
    })

    test('the widget refreshes hourly and the action allows 30 packs a minute', () => {
        expect(registry.getWidget('pokemon_tcg', 'booster_opener')?.refresh).toEqual({ default: 3600, min: 600 })
        expect(registry.getAction('pokemon_tcg', 'open_pack')?.rateLimit).toEqual({ max: 30, windowSeconds: 60 })
        expect(registry.getAction('pokemon_tcg', 'open_pack')?.params).toEqual([
            { name: 'set', label: expect.any(String), type: 'string', required: true },
            { name: 'booster', label: expect.any(String), type: 'string' },
        ])
    })

    test('both widget params are hidden from the settings form, and a new widget starts on Base Set', async () => {
        expect(registry.getWidget('pokemon_tcg', 'booster_opener')?.params).toEqual([
            { name: 'set', label: 'Collection', type: 'string', hidden: true, default: 'base1' },
            { name: 'booster', label: 'Booster', type: 'string', hidden: true },
        ])

        const created = await dashboard.create(ALICE, { serviceId: 'pokemon_tcg', widgetId: 'booster_opener', params: {} })

        expect(created.params).toEqual({ set: 'base1' })
    })

    test('appears in /about.json in production', async () => {
        __resetRegistryForTests()
        registerServices('production')

        const response = await aboutRoutes.handle(new Request('http://localhost/about.json'))
        const body = await response.json()
        const pokemon = body.server.services.find((service: { name: string }) => service.name === 'Pokémon TCG')

        expect(pokemon.widgets).toEqual([
            {
                name: 'Booster opener',
                description: expect.any(String),
                params: [
                    { name: 'set', type: 'string' },
                    { name: 'booster', type: 'string' },
                ],
            },
        ])
    })
})

describe('booster_opener', () => {
    test('asks TCGdex for the collections in one GraphQL request', async () => {
        await fetchWidget()

        expect(stub.calls).toEqual([{ url: GRAPHQL_URL, method: 'POST', target: 'sets' }])
    })

    test('returns the collections with pack rules, oldest first, each with the seven fields', async () => {
        const sets = await fetchSetList()

        expect(sets).toEqual([
            {
                id: 'base1',
                name: 'Base Set',
                serie: { id: 'base', name: 'Base' },
                logo: 'https://assets.tcgdex.net/en/base/base1/logo.webp',
                cardsPerPack: 11,
                confidence: 'high',
                boosters: [],
            },
            {
                id: 'sv01',
                name: 'Scarlet & Violet',
                serie: { id: 'sv', name: 'Scarlet & Violet' },
                logo: 'https://assets.tcgdex.net/en/sv/sv01/logo.webp',
                cardsPerPack: 11,
                confidence: 'medium',
                boosters: [],
            },
            {
                id: 'A1',
                name: 'Genetic Apex',
                serie: { id: 'tcgp', name: 'Pokémon TCG Pocket' },
                logo: 'https://assets.tcgdex.net/en/tcgp/A1/logo.webp',
                cardsPerPack: 5,
                confidence: 'high',
                boosters: [
                    { id: 'boo_A1-mewtwo', name: 'Mewtwo' },
                    { id: 'boo_A1-charizard', name: 'Charizard' },
                    { id: 'boo_A1-pikachu', name: 'Pikachu' },
                ],
            },
            {
                id: 'A1a',
                name: 'Mythical Island',
                serie: { id: 'tcgp', name: 'Pokémon TCG Pocket' },
                logo: 'https://assets.tcgdex.net/en/tcgp/A1a/logo.webp',
                cardsPerPack: 5,
                confidence: 'high',
                // A single booster is not a choice, so none is offered.
                boosters: [],
            },
        ])
    })

    test('returns all 152 collections when the upstream lists them all', async () => {
        stub.change((world) => {
            world.sets = openableSetIds().map((id) => rawSet(id, `Name of ${id}`, ['x', 'X']))
        })

        const sets = await fetchSetList()

        expect(sets.map((set) => set.id)).toEqual(openableSetIds())
        for (const set of sets) {
            expect(Object.keys(set).sort()).toEqual(['boosters', 'cardsPerPack', 'confidence', 'id', 'logo', 'name', 'serie'])
        }
    })

    test('a collection without a logo has none', async () => {
        stub.change((world) => {
            world.sets = [{ ...rawSet('sv01', 'Scarlet & Violet', ['sv', 'Scarlet & Violet']), logo: null }]
        })

        expect((await fetchSetList())[0].logo).toBeNull()
    })

    test('accepts the collection and booster the widget saved', async () => {
        const sets = await fetchSetList({ set: 'A1', booster: 'boo_A1-pikachu' })

        expect(sets.length).toBeGreaterThan(0)
    })

    // The settings form lets anything be typed there. The list is what lets
    // the user pick a valid collection, so it must come back all the same.
    test.each([
        { set: 'nope' },
        { set: '1', booster: '1' },
        { set: 'sve' },
        { set: 'A1', booster: 'boo_gone' },
    ])('still returns the list when the saved choice is %j', async (params) => {
        const sets = await fetchSetList(params)

        expect(sets.map((set) => set.id)).toEqual(['base1', 'sv01', 'A1', 'A1a'])
    })

    test('a malformed answer is upstream_error', async () => {
        stub.failWith(() => ({ data: { sets: 'nope' } }))

        expect(await fetchWidget()).toEqual({ ok: false, code: 'upstream_error' })
    })

    test('an upstream 429 is rate_limited', async () => {
        stub.failWith(() => {
            throw new WidgetFetchError('rate_limited', '429')
        })

        expect(await fetchWidget()).toEqual({ ok: false, code: 'rate_limited' })
    })

    test('a second fetch within refresh.min is served from cache', async () => {
        await fetchWidget()
        await fetchWidget()

        expect(stub.calls).toHaveLength(1)
    })
})

describe('open_pack: request', () => {
    test('asks for the collection list, the collection and the one it borrows energies from', async () => {
        await open({ set: 'sv01' })

        expect(stub.targets().sort()).toEqual(['sets', 'sv01', 'sve'])
        for (const call of stub.calls) {
            expect(call.url).toBe(GRAPHQL_URL)
            expect(call.method).toBe('POST')
        }
    })

    test('a second pack of the same collection sends no request', async () => {
        await open({ set: 'sv01' })
        const before = stub.calls.length

        await open({ set: 'sv01' })
        await open({ set: 'sv01' })

        expect(stub.calls).toHaveLength(before)
    })

    test('another collection only asks for its own cards', async () => {
        await open({ set: 'sv01' })
        const before = stub.calls.length

        await open({ set: 'base1' })

        expect(stub.targets().slice(before)).toEqual(['base1'])
    })

    test('the list the widget fetched is reused by the action', async () => {
        await fetchWidget()
        await open({ set: 'base1' })

        expect(stub.targets()).toEqual(['sets', 'base1'])
    })
})

describe('open_pack: the pack', () => {
    test('sv01 gives 11 cards in slot order, the energy coming from sve', async () => {
        const pack = await open({ set: 'sv01' })

        expect(pack.set).toEqual({ id: 'sv01', name: 'Scarlet & Violet' })
        expect(pack.booster).toBeNull()
        expect(pack.variant).toBeNull()
        expect(pack.extras).toEqual(['1 Pokémon TCG Live code card'])
        expect(pack.cards.map((card) => card.slot)).toEqual([
            'common', 'common', 'common', 'common',
            'uncommon', 'uncommon', 'uncommon',
            'reverse1',
            'reverse2',
            'rare',
            'energy',
        ])
        expect(pack.cards.slice(0, 4).every((card) => card.rarity === 'Common')).toBe(true)
        expect(pack.cards.slice(4, 7).every((card) => card.rarity === 'Uncommon')).toBe(true)

        const energy = pack.cards[10]
        expect(energy.id.startsWith('sve-')).toBe(true)
        expect(energy.name).toMatch(/ Energy$/)
        expect(energy.image).toBeNull()
    })

    test('every card has exactly the eight documented fields and both picture sizes', async () => {
        const pack = await open({ set: 'sv01' })

        for (const card of pack.cards) {
            expect(Object.keys(card).sort()).toEqual(['id', 'image', 'kind', 'name', 'pattern', 'rarity', 'reverseHolo', 'slot'])
        }
        const first = pack.cards[0]
        const localId = first.id.split('-')[1]
        expect(first.image).toEqual({
            low: `https://assets.tcgdex.net/en/x/sv01/${localId}/low.webp`,
            high: `https://assets.tcgdex.net/en/x/sv01/${localId}/high.webp`,
        })
    })

    test('base1 gives 11 cards, two of them basic energies', async () => {
        const pack = await open({ set: 'base1' })

        expect(pack.cards).toHaveLength(11)
        const energies = pack.cards.filter((card) => card.slot === 'energy')
        expect(energies).toHaveLength(2)
        expect(energies.every((card) => / Energy$/.test(card.name))).toBe(true)
        expect(pack.cards.filter((card) => card.slot === 'common').some((card) => / Energy$/.test(card.name))).toBe(false)
        expect(pack.extras).toEqual([])
    })

    test('a reverse holo outcome is flagged, a hit that replaces it is not', async () => {
        // 0 everywhere picks the first outcome of every slot: plain reverse holos.
        const always = spyOn(Math, 'random').mockReturnValue(0)
        const plain = await open({ set: 'sv01' })
        // 0.999 picks the last outcome of every slot: in the second reverse slot, a Hyper rare.
        always.mockReturnValue(0.999)
        const hits = await open({ set: 'sv01' })
        always.mockRestore()

        expect(plain.cards.filter((card) => card.reverseHolo).map((card) => card.slot)).toEqual(['reverse1', 'reverse2'])

        const hit = hits.cards.find((card) => card.slot === 'reverse2')
        expect(hit?.rarity).toBe('Hyper rare')
        expect(hit?.reverseHolo).toBe(false)
    })

    test('the same rolls give the same pack', async () => {
        const always = spyOn(Math, 'random').mockReturnValue(0)
        const first = await open({ set: 'sv01' })
        const second = await open({ set: 'sv01' })
        always.mockRestore()

        expect(second).toEqual(first)
        // With every roll at 0 the four commons are the first four of the pool, never one card four times.
        expect(new Set(first.cards.slice(0, 4).map((card) => card.id)).size).toBe(4)
    })
})

describe('open_pack: boosters', () => {
    function boosterOf(cardId: string): string {
        const boosters = stub.rawCard('A1', cardId)?.boosters as { id: string }[]
        return boosters[0].id
    }

    test('A1 gives 5 cards, all from the chosen booster', async () => {
        for (let pack = 0; pack < 20; pack++) {
            const opened = await open({ set: 'A1', booster: 'boo_A1-pikachu' })

            expect(opened.booster).toBe('boo_A1-pikachu')
            expect(opened.cards).toHaveLength(5)
            for (const card of opened.cards) expect(boosterOf(card.id)).toBe('boo_A1-pikachu')
        }
    })

    test('A1 without a booster opens its first one', async () => {
        const opened = await open({ set: 'A1' })

        expect(opened.booster).toBe('boo_A1-mewtwo')
        for (const card of opened.cards) expect(boosterOf(card.id)).toBe('boo_A1-mewtwo')
    })

    test.each([
        ['an unknown collection', { set: 'nope' }],
        ['a collection that only lends cards', { set: 'sve' }],
        ['a booster the collection does not have', { set: 'A1', booster: 'boo_A2-palkia' }],
        ['a booster on a collection without any', { set: 'sv01', booster: 'boo_A1-mewtwo' }],
        ['a booster on a single-booster collection', { set: 'A1a', booster: 'boo_A1a-mew' }],
    ])('%s is 400 INVALID_PARAMS, without any request', async (_label, params) => {
        await expect(runOpen(params)).rejects.toMatchObject({ status: 400, code: 'INVALID_PARAMS' })
        expect(stub.calls).toHaveLength(0)
    })

    test('a missing collection is 400 INVALID_PARAMS', async () => {
        await expect(runOpen({})).rejects.toMatchObject({ status: 400, code: 'INVALID_PARAMS' })
        await expect(runOpen({ set: '   ' })).rejects.toMatchObject({ status: 400, code: 'INVALID_PARAMS' })
    })
})

describe('open_pack: failures', () => {
    test('a malformed card list is upstream_error', async () => {
        stub.failWith(() => ({ data: { nope: true } }))

        expect(await runOpen({ set: 'sv01' })).toEqual({ ok: false, code: 'upstream_error' })
    })

    test('an upstream 429 is rate_limited', async () => {
        stub.failWith(() => {
            throw new WidgetFetchError('rate_limited', '429')
        })

        expect(await runOpen({ set: 'sv01' })).toEqual({ ok: false, code: 'rate_limited' })
    })

    test('a collection TCGdex no longer lists is upstream_error', async () => {
        stub.change((world) => {
            world.sets = world.sets.filter((set) => set.id !== 'sv01')
        })

        expect(await runOpen({ set: 'sv01' })).toEqual({ ok: false, code: 'upstream_error' })
    })

    test('a slot left without any card is upstream_error', async () => {
        stub.change((world) => {
            world.cards.sv01 = world.cards.sv01.filter((card) => card.rarity !== 'Uncommon')
        })

        expect(await runOpen({ set: 'sv01' })).toEqual({ ok: false, code: 'upstream_error' })
    })

    test('a failure is not remembered: the next pack asks again', async () => {
        stub.failWith(() => {
            throw new WidgetFetchError('upstream_error', 'down')
        })
        expect(await runOpen({ set: 'sv01' })).toEqual({ ok: false, code: 'upstream_error' })

        stub.failWith(null)
        const pack = await open({ set: 'sv01' })

        expect(pack.cards).toHaveLength(11)
    })
})

describe('open_pack: rate limit', () => {
    afterEach(() => {
        clock = 0
    })

    test('the 31st pack within 60 s is 429 with the seconds to wait; another user is not affected', async () => {
        for (let pack = 0; pack < 30; pack++) await open({ set: 'sv01' })

        const refused = await runOpen({ set: 'sv01' }).catch((error) => error)
        expect(refused).toBeInstanceOf(RateLimitedError)
        expect(refused).toMatchObject({ status: 429, code: 'RATE_LIMITED' })
        expect(refused.retryAfterSeconds).toBeGreaterThan(0)

        expect((await runOpen({ set: 'sv01' }, 'user-bob')).ok).toBe(true)

        clock += 60_000
        expect((await runOpen({ set: 'sv01' })).ok).toBe(true)
    })
})
