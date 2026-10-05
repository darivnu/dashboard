import { expect, test } from 'vitest'
import { parseFreeGames } from './parse'

const game = {
    id: 'cb733f3432db46bca94965b422c33ede',
    title: 'Out of Sight',
    publisher: 'The Gang Studio AB',
    image: 'https://cdn.example/out-of-sight-wide.jpg',
    url: 'https://store.epicgames.com/en-US/p/out-of-sight-b96ca8',
    originalPrice: '€13.99',
    startsAt: '2026-10-08T15:00:00.000Z',
    endsAt: '2026-10-15T15:00:00.000Z',
}

const bare = {
    ...game,
    id: 'bare',
    publisher: null,
    image: null,
    originalPrice: null,
}

test('accepts games in both lists', () => {
    const data = { current: [game, bare], upcoming: [bare] }
    expect(parseFreeGames(data)).toEqual(data)
})

test('accepts two empty lists', () => {
    expect(parseFreeGames({ current: [], upcoming: [] })).toEqual({
        current: [],
        upcoming: [],
    })
})

// The API client turns text that looks like an ISO date into a Date object
// before the widget sees it, so this is the form the dates really arrive in.
test('accepts dates that arrive as Date objects and returns them as ISO text', () => {
    const asDates = {
        ...game,
        startsAt: new Date(game.startsAt),
        endsAt: new Date(game.endsAt),
    }
    expect(parseFreeGames({ current: [asDates], upcoming: [asDates] })).toEqual(
        {
            current: [game],
            upcoming: [game],
        },
    )
})

test('returns dates in one format whatever notation they arrive in', () => {
    const parsed = parseFreeGames({
        current: [
            {
                ...game,
                startsAt: '2026-10-08T17:00:00+02:00',
                endsAt: '2026-10-15T15:00:00Z',
            },
        ],
        upcoming: [],
    })
    expect(parsed.current[0]).toEqual(game)
})

test('keeps only the fields it knows', () => {
    const parsed = parseFreeGames({
        current: [{ ...game, description: 'A game', tags: [] }],
        upcoming: [],
        total: 1,
    })
    expect(parsed).toEqual({ current: [game], upcoming: [] })
})

test.each([
    ['null', null],
    ['a string', 'games'],
    ['a list', [game]],
    ['an object without the lists', { games: [] }],
    ['a missing current list', { upcoming: [] }],
    ['a missing upcoming list', { current: [] }],
    ['current that is not a list', { current: 'none', upcoming: [] }],
    ['upcoming that is not a list', { current: [], upcoming: {} }],
])('refuses %s', (_name, raw) => {
    expect(() => parseFreeGames(raw)).toThrow('Unexpected free games data')
})

test.each([
    ['a game that is not an object', 'Out of Sight'],
    ['a game that is null', null],
    ['a missing id', { ...game, id: undefined }],
    ['an empty id', { ...game, id: '' }],
    ['an id that is a number', { ...game, id: 7 }],
    ['a missing title', { ...game, title: undefined }],
    ['an empty title', { ...game, title: '' }],
    ['a missing publisher', { ...game, publisher: undefined }],
    ['a publisher that is a number', { ...game, publisher: 505 }],
    ['a missing image', { ...game, image: undefined }],
    ['an image that is an object', { ...game, image: { url: 'x' } }],
    [
        'an image that is not https',
        { ...game, image: 'http://cdn.example/a.jpg' },
    ],
    ['a missing link', { ...game, url: undefined }],
    ['a link that is null', { ...game, url: null }],
    ['a link that is not https', { ...game, url: 'javascript:alert(1)' }],
    ['a missing price', { ...game, originalPrice: undefined }],
    ['a price that is a number', { ...game, originalPrice: 1399 }],
    ['a missing start date', { ...game, startsAt: undefined }],
    ['a start date that is not a date', { ...game, startsAt: 'soon' }],
    ['a start date that is a number', { ...game, startsAt: 1791000000000 }],
    ['an end date that is null', { ...game, endsAt: null }],
    [
        'an end date that is an invalid Date',
        { ...game, endsAt: new Date('soon') },
    ],
    [
        'a start date that is an object',
        { ...game, startsAt: { iso: game.startsAt } },
    ],
    ['an end date that is not a date', { ...game, endsAt: '' }],
])('refuses a list containing %s', (_name, bad) => {
    expect(() =>
        parseFreeGames({ current: [game, bad], upcoming: [] }),
    ).toThrow('Unexpected free games data')
    expect(() => parseFreeGames({ current: [], upcoming: [bad] })).toThrow(
        'Unexpected free games data',
    )
})
