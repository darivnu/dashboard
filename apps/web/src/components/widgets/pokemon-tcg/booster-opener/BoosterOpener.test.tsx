import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import {
    apiMock,
    fail,
    makeInstance,
    ok,
    resetApiMock,
} from '../../../../test/apiMock'
import { renderWithQuery } from '../../../../test/renderWithQuery'
import BoosterOpener from './BoosterOpener'
import type { BoosterOpenerData, PackCard, PackSet } from './parse'

vi.mock(
    '../../../../api',
    async () => (await import('../../../../test/apiMock')).apiModule,
)

function set(
    id: string,
    name: string,
    overrides: Partial<PackSet> = {},
): PackSet {
    return {
        id,
        name,
        serie: { id: 'sv', name: 'Scarlet & Violet' },
        logo: null,
        cardsPerPack: 11,
        confidence: 'medium',
        boosters: [],
        ...overrides,
    }
}

const data: BoosterOpenerData = {
    sets: [
        set('base1', 'Base Set', {
            serie: { id: 'base', name: 'Base' },
            confidence: 'high',
        }),
        set('sv01', 'Scarlet & Violet'),
        set('A1', 'Genetic Apex', {
            serie: { id: 'tcgp', name: 'Pokémon TCG Pocket' },
            confidence: 'high',
            cardsPerPack: 5,
            boosters: [
                { id: 'boo_A1-mewtwo', name: 'Mewtwo' },
                { id: 'boo_A1-pikachu', name: 'Pikachu' },
            ],
        }),
    ],
}

function card(name: string, overrides: Partial<PackCard> = {}): PackCard {
    return {
        id: name,
        name,
        rarity: 'Common',
        image: null,
        slot: 'common',
        kind: 'common',
        reverseHolo: false,
        pattern: null,
        ...overrides,
    }
}

function packOf(names: string[], extras: string[] = []) {
    return ok({
        ok: true,
        data: {
            set: { id: 'sv01', name: 'Scarlet & Violet' },
            booster: null,
            variant: null,
            cards: names.map((name) => card(name)),
            extras,
        },
    })
}

function show(params: Record<string, string | number> = {}) {
    const instance = makeInstance({
        serviceId: 'pokemon_tcg',
        widgetId: 'booster_opener',
        params,
    })
    // The update answers with the instance as it was sent, like the API does.
    apiMock.updateInstance.mockImplementation(
        async (body: { params: Record<string, string> }) =>
            ok({ ...instance, params: body.params }),
    )
    const view = renderWithQuery(
        <BoosterOpener
            instance={instance}
            params={instance.params}
            data={data}
        />,
    )
    return { instance, ...view }
}

const collection = () => screen.getByRole('combobox', { name: 'Collection' })
const openButton = () => screen.getByRole('button', { name: 'Open pack' })
const faceDownCards = () =>
    screen.queryAllByRole('button', { name: 'Reveal card' })

async function openPack() {
    await userEvent.click(openButton())
    await waitFor(() => expect(faceDownCards().length).toBeGreaterThan(0))
}

beforeEach(() => {
    resetApiMock()
})

test('with no collection chosen it invites to choose and cannot open a pack', () => {
    show()

    expect(
        screen.getByText('Choose a collection to open a pack.'),
    ).toBeVisible()
    expect(openButton()).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Reveal all' })).toBeNull()
})

test('starts on the collection saved in the settings', () => {
    show({ set: 'sv01' })

    expect(collection()).toHaveValue('sv01')
    expect(openButton()).toBeEnabled()
    expect(screen.queryByText('Choose a collection to open a pack.')).toBeNull()
})

test('starts on the saved booster of a collection that has several', () => {
    show({ set: 'A1', booster: 'boo_A1-pikachu' })

    expect(screen.getByRole('combobox', { name: 'Booster' })).toHaveValue(
        'boo_A1-pikachu',
    )
})

test('a saved collection that is no longer offered counts as none', () => {
    show({ set: 'gone' })

    expect(collection()).toHaveValue('')
    expect(openButton()).toBeDisabled()
})

test('choosing a collection saves it in the settings of this widget', async () => {
    const { instance } = show()

    await userEvent.selectOptions(collection(), 'sv01')

    expect(collection()).toHaveValue('sv01')
    expect(apiMock.instanceById).toHaveBeenCalledWith({ id: instance.id })
    expect(apiMock.updateInstance).toHaveBeenCalledWith({
        params: { set: 'sv01' },
    })
    expect(openButton()).toBeEnabled()
})

test('choosing a collection with boosters saves its first booster too', async () => {
    show()

    await userEvent.selectOptions(collection(), 'A1')

    expect(apiMock.updateInstance).toHaveBeenCalledWith({
        params: { set: 'A1', booster: 'boo_A1-mewtwo' },
    })
})

test('choosing a booster saves it', async () => {
    show({ set: 'A1', booster: 'boo_A1-mewtwo' })

    await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Booster' }),
        'boo_A1-pikachu',
    )

    expect(apiMock.updateInstance).toHaveBeenCalledWith({
        params: { set: 'A1', booster: 'boo_A1-pikachu' },
    })
})

test('a choice that cannot be saved still works, and says it will not be remembered', async () => {
    show()
    apiMock.updateInstance.mockResolvedValue(
        fail(500, 'INTERNAL', 'Something broke'),
    )

    await userEvent.selectOptions(collection(), 'sv01')

    expect(await screen.findByText(/could not be saved/)).toBeVisible()
    expect(collection()).toHaveValue('sv01')
    expect(openButton()).toBeEnabled()
})

test('opens a pack of the chosen collection, every card face down', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(
        packOf(['Pineco', 'Heracross', 'Skwovet']),
    )

    await openPack()

    expect(apiMock.runAction).toHaveBeenCalledWith({ params: { set: 'sv01' } })
    expect(faceDownCards()).toHaveLength(3)
    expect(screen.queryByText('Pineco')).toBeNull()
})

test('opens the chosen booster', async () => {
    show({ set: 'A1', booster: 'boo_A1-pikachu' })
    apiMock.runAction.mockResolvedValue(packOf(['Pikachu']))

    await openPack()

    expect(apiMock.runAction).toHaveBeenCalledWith({
        params: { set: 'A1', booster: 'boo_A1-pikachu' },
    })
})

test('a saved booster the collection does not have falls back to its first one', async () => {
    show({ set: 'A1', booster: 'boo_gone' })
    apiMock.runAction.mockResolvedValue(packOf(['Mewtwo']))

    await openPack()

    expect(apiMock.runAction).toHaveBeenCalledWith({
        params: { set: 'A1', booster: 'boo_A1-mewtwo' },
    })
})

test('a click turns one card face up and leaves the others', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(
        packOf(['Pineco', 'Heracross', 'Skwovet']),
    )
    await openPack()

    await userEvent.click(faceDownCards()[1])

    expect(screen.getByText('Heracross')).toBeVisible()
    expect(screen.queryByText('Pineco')).toBeNull()
    expect(faceDownCards()).toHaveLength(2)
})

test('Reveal all turns the rest face up and then goes away', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(
        packOf(['Pineco', 'Heracross', 'Skwovet']),
    )
    await openPack()
    await userEvent.click(faceDownCards()[0])

    await userEvent.click(screen.getByRole('button', { name: 'Reveal all' }))

    expect(faceDownCards()).toHaveLength(0)
    for (const name of ['Pineco', 'Heracross', 'Skwovet']) {
        expect(screen.getByText(name)).toBeVisible()
    }
    expect(screen.queryByRole('button', { name: 'Reveal all' })).toBeNull()
})

test('Reveal all goes away once the last card is turned by hand', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(packOf(['Pineco']))
    await openPack()

    await userEvent.click(faceDownCards()[0])

    expect(screen.queryByRole('button', { name: 'Reveal all' })).toBeNull()
})

test('a pack with the same card twice shows it twice', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(packOf(['Krookodile', 'Krookodile']))
    await openPack()

    await userEvent.click(screen.getByRole('button', { name: 'Reveal all' }))

    expect(screen.getAllByText('Krookodile')).toHaveLength(2)
})

test('says what else was in the pack', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(
        packOf(
            ['Pineco'],
            ['1 Pokémon TCG Live code card', '1 basic Energy card'],
        ),
    )

    await openPack()

    expect(
        screen.getByText(
            'Also in the pack: 1 Pokémon TCG Live code card, 1 basic Energy card',
        ),
    ).toBeVisible()
})

test('a pack of cards only has no such line', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(packOf(['Pineco']))

    await openPack()

    expect(screen.queryByText(/Also in the pack/)).toBeNull()
})

test('the button cannot be clicked again while a pack is being opened', async () => {
    show({ set: 'sv01' })
    let answer: (value: unknown) => void = () => {}
    apiMock.runAction.mockReturnValue(
        new Promise((resolve) => {
            answer = resolve
        }),
    )

    await userEvent.click(openButton())
    await waitFor(() => expect(openButton()).toBeDisabled())

    answer(packOf(['Pineco']))
    await waitFor(() => expect(openButton()).toBeEnabled())
})

test('a new pack starts with every card face down again', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(packOf(['Pineco', 'Heracross']))
    await openPack()
    await userEvent.click(screen.getByRole('button', { name: 'Reveal all' }))

    apiMock.runAction.mockResolvedValue(packOf(['Skwovet', 'Lechonk']))
    await userEvent.click(openButton())

    await waitFor(() => expect(faceDownCards()).toHaveLength(2))
    expect(screen.queryByText('Pineco')).toBeNull()
    expect(screen.queryByText('Skwovet')).toBeNull()
})

test('a refused pack shows why and leaves the previous pack on screen', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(packOf(['Pineco', 'Heracross']))
    await openPack()
    await userEvent.click(faceDownCards()[0])

    apiMock.runAction.mockResolvedValue({
        ...fail(429, 'RATE_LIMITED', 'Too many requests, try again later'),
        response: new Response(null, {
            status: 429,
            headers: { 'Retry-After': '42' },
        }),
    })
    await userEvent.click(openButton())

    expect(
        await screen.findByText('Too many packs, try again in 42 seconds'),
    ).toBeVisible()
    expect(screen.getByText('Pineco')).toBeVisible()
    expect(faceDownCards()).toHaveLength(1)
})

test('a pack that cannot be opened says so', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(
        ok({ ok: false, code: 'upstream_error' }),
    )

    await userEvent.click(openButton())

    expect(await screen.findByText('Could not open the pack')).toBeVisible()
    expect(faceDownCards()).toHaveLength(0)
})

test('choosing another collection puts the pack and the error away', async () => {
    show({ set: 'sv01' })
    apiMock.runAction.mockResolvedValue(packOf(['Pineco'], ['1 code card']))
    await openPack()

    await userEvent.selectOptions(collection(), 'base1')

    await waitFor(() => expect(faceDownCards()).toHaveLength(0))
    expect(screen.queryByText(/Also in the pack/)).toBeNull()
})
