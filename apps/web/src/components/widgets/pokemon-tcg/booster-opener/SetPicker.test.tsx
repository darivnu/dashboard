import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { PackSet } from './parse'
import SetPicker from './SetPicker'

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

const base = { id: 'base', name: 'Base' }
const pocket = { id: 'tcgp', name: 'Pokémon TCG Pocket' }

const sets: PackSet[] = [
    set('base1', 'Base Set', { serie: base, confidence: 'high' }),
    set('base2', 'Jungle', { serie: base }),
    set('sv01', 'Scarlet & Violet'),
    set('sv02', 'Paldea Evolved', { confidence: 'low' }),
    set('A1', 'Genetic Apex', {
        serie: pocket,
        confidence: 'high',
        cardsPerPack: 5,
        boosters: [
            { id: 'boo_A1-mewtwo', name: 'Mewtwo' },
            { id: 'boo_A1-charizard', name: 'Charizard' },
            { id: 'boo_A1-pikachu', name: 'Pikachu' },
        ],
    }),
]

function show(selectedId: string | null = null, booster: string | null = null) {
    const onChange = vi.fn()
    const selected = sets.find((each) => each.id === selectedId) ?? null
    render(
        <SetPicker
            sets={sets}
            selected={selected}
            booster={booster}
            onChange={onChange}
        />,
    )
    return onChange
}

function collectionList() {
    return screen.getByRole('combobox', { name: 'Collection' })
}

test('lists every collection under its serie, in the order given', () => {
    show()

    const groups = within(collectionList()).getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('label'))).toEqual([
        'Base',
        'Scarlet & Violet',
        'Pokémon TCG Pocket',
    ])
    expect(
        within(groups[0])
            .getAllByRole('option')
            .map((option) => option.textContent),
    ).toEqual(['Base Set', 'Jungle (estimated odds)'])
})

test('says how far the odds of a collection can be trusted', () => {
    show()

    expect(screen.getByRole('option', { name: 'Base Set' })).toBeVisible()
    expect(
        screen.getByRole('option', {
            name: 'Scarlet & Violet (estimated odds)',
        }),
    ).toBeVisible()
    expect(
        screen.getByRole('option', { name: 'Paldea Evolved (uncertain odds)' }),
    ).toBeVisible()
})

test('with nothing chosen it invites to choose, and that line cannot be picked', () => {
    show()

    expect(collectionList()).toHaveValue('')
    expect(
        screen.getByRole('option', { name: 'Choose a collection…' }),
    ).toBeDisabled()
})

test('shows the chosen collection', () => {
    show('sv01')

    expect(collectionList()).toHaveValue('sv01')
})

test('choosing a collection reports it, without a booster', async () => {
    const onChange = show()

    await userEvent.selectOptions(collectionList(), 'sv01')

    expect(onChange).toHaveBeenCalledWith('sv01', null)
})

test('choosing a collection with several boosters starts on its first one', async () => {
    const onChange = show()

    await userEvent.selectOptions(collectionList(), 'A1')

    expect(onChange).toHaveBeenCalledWith('A1', 'boo_A1-mewtwo')
})

test('a collection with a single pack has no booster list', () => {
    show('sv01')

    expect(screen.queryByRole('combobox', { name: 'Booster' })).toBeNull()
})

test('a collection with several boosters lists them and shows the chosen one', () => {
    show('A1', 'boo_A1-pikachu')

    const boosters = screen.getByRole('combobox', { name: 'Booster' })
    expect(
        within(boosters)
            .getAllByRole('option')
            .map((option) => option.textContent),
    ).toEqual(['Mewtwo', 'Charizard', 'Pikachu'])
    expect(boosters).toHaveValue('boo_A1-pikachu')
})

test('choosing a booster reports it with the collection', async () => {
    const onChange = show('A1', 'boo_A1-mewtwo')

    await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Booster' }),
        'boo_A1-charizard',
    )

    expect(onChange).toHaveBeenCalledWith('A1', 'boo_A1-charizard')
})
