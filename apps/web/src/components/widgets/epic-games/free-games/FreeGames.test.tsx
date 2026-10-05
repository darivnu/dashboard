import {
    type BoundFunctions,
    type queries,
    render,
    screen,
    within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { makeInstance } from '../../../../test/apiMock'
import FreeGames from './FreeGames'
import type { FreeGame, FreeGamesData } from './parse'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Built in the time zone the tests run in, because the cards show dates in
// the viewer's time zone.
const START = new Date(2026, 9, 8, 17)
const END = new Date(2026, 9, 15, 17)

beforeEach(() => {
    // Three days and two hours before the giveaways end.
    vi.useFakeTimers()
    vi.setSystemTime(END.getTime() - 3 * DAY - 2 * HOUR)
})

afterEach(() => {
    vi.useRealTimers()
})

function game(title: string, overrides: Partial<FreeGame> = {}): FreeGame {
    return {
        id: title.toLowerCase().replaceAll(' ', '-'),
        title,
        publisher: 'Studio',
        image: null,
        url: `https://store.epicgames.com/en-US/p/${title}`,
        originalPrice: '€19.99',
        startsAt: START.toISOString(),
        endsAt: END.toISOString(),
        ...overrides,
    }
}

function widget(data: FreeGamesData, title = 'Free games') {
    const instance = makeInstance({
        serviceId: 'epic_games',
        widgetId: 'free_games',
        title,
        params: { country: 'ES' },
    })
    return (
        <section aria-label={title}>
            <FreeGames
                instance={instance}
                params={instance.params}
                data={data}
            />
        </section>
    )
}

/** The part of the widget under the heading with this name. */
function sectionOf(heading: string) {
    const section = screen
        .getByRole('heading', { name: heading })
        .closest('section')
    if (!section) throw new Error(`no section around "${heading}"`)
    return within(section)
}

function titles(scope: BoundFunctions<typeof queries>) {
    return scope.getAllByRole('link').map((link) => link.textContent)
}

test('shows the games free now and the upcoming ones under their own heading', () => {
    render(
        widget({
            current: [game('System Shock 2')],
            upcoming: [game('Out of Sight'), game('TerraScape')],
        }),
    )

    expect(titles(sectionOf('Free now'))).toEqual(['System Shock 2'])
    expect(titles(sectionOf('Coming soon'))).toEqual([
        'Out of Sight',
        'TerraScape',
    ])
})

test('a game free now says how long is left, counted from the current time', () => {
    render(widget({ current: [game('System Shock 2')], upcoming: [] }))

    expect(
        sectionOf('Free now').getByText('Until 15 Oct · ends in 3 days'),
    ).toBeVisible()
})

test('an upcoming game says the dates it will be free between', () => {
    render(widget({ current: [], upcoming: [game('Out of Sight')] }))

    expect(
        sectionOf('Coming soon').getByText('Free 8 Oct – 15 Oct'),
    ).toBeVisible()
})

test('keeps the order of each list', () => {
    render(
        widget({
            current: [game('C'), game('A'), game('B')],
            upcoming: [game('Z'), game('Y')],
        }),
    )

    expect(titles(sectionOf('Free now'))).toEqual(['C', 'A', 'B'])
    expect(titles(sectionOf('Coming soon'))).toEqual(['Z', 'Y'])
})

test('a game free now and free again later appears in both sections', () => {
    const twice = game('LISA')
    render(widget({ current: [twice], upcoming: [twice] }))

    expect(titles(sectionOf('Free now'))).toEqual(['LISA'])
    expect(titles(sectionOf('Coming soon'))).toEqual(['LISA'])
})

test('without games free now, that section is left out', () => {
    render(widget({ current: [], upcoming: [game('Out of Sight')] }))

    expect(
        screen.queryByRole('heading', { name: 'Free now' }),
    ).not.toBeInTheDocument()
    expect(titles(sectionOf('Coming soon'))).toEqual(['Out of Sight'])
})

test('without upcoming games, that section is left out', () => {
    render(widget({ current: [game('System Shock 2')], upcoming: [] }))

    expect(
        screen.queryByRole('heading', { name: 'Coming soon' }),
    ).not.toBeInTheDocument()
    expect(titles(sectionOf('Free now'))).toEqual(['System Shock 2'])
})

test('with no games at all it says so', () => {
    render(widget({ current: [], upcoming: [] }))

    expect(screen.getByText('No free games right now.')).toBeVisible()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

test('two widgets side by side show their own games', () => {
    render(
        <>
            {widget({ current: [game('Spanish Game')], upcoming: [] }, 'Spain')}
            {widget({ current: [], upcoming: [game('American Game')] }, 'USA')}
        </>,
    )

    const spain = within(screen.getByRole('region', { name: 'Spain' }))
    const usa = within(screen.getByRole('region', { name: 'USA' }))

    expect(titles(spain)).toEqual(['Spanish Game'])
    expect(spain.queryByText('Coming soon')).not.toBeInTheDocument()
    expect(titles(usa)).toEqual(['American Game'])
    expect(usa.queryByText('Free now')).not.toBeInTheDocument()
})
