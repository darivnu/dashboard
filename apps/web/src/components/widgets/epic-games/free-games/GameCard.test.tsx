import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import GameCard from './GameCard'
import type { FreeGame } from './parse'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Built in the time zone the tests run in, because the card shows dates in
// the viewer's time zone.
const START = new Date(2026, 9, 8, 17)
const END = new Date(2026, 9, 15, 17)

const game: FreeGame = {
    id: 'cb733f3432db46bca94965b422c33ede',
    title: 'Out of Sight',
    publisher: 'The Gang Studio AB',
    image: 'https://cdn.example/out-of-sight-wide.jpg',
    url: 'https://store.epicgames.com/en-US/p/out-of-sight-b96ca8',
    originalPrice: '€13.99',
    startsAt: START.toISOString(),
    endsAt: END.toISOString(),
}

/** Three days and two hours before the giveaway ends. */
const NOW = END.getTime() - 3 * DAY - 2 * HOUR

function cover(container: HTMLElement) {
    return container.querySelector('img')
}

test('the title is a link to the store page, opened in a new tab', () => {
    render(<GameCard game={game} upcoming={false} now={NOW} />)

    const link = screen.getByRole('link', { name: 'Out of Sight' })
    expect(link).toHaveAttribute('href', game.url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
})

test('shows the publisher', () => {
    render(<GameCard game={game} upcoming={false} now={NOW} />)

    expect(screen.getByText('The Gang Studio AB')).toBeVisible()
})

test('a game without a publisher has no publisher line', () => {
    const { container } = render(
        <GameCard
            game={{ ...game, publisher: null }}
            upcoming={false}
            now={NOW}
        />,
    )

    expect(container.querySelectorAll('p')).toHaveLength(2)
})

test('a game free now shows its usual price struck through, next to Free', () => {
    const { container } = render(
        <GameCard game={game} upcoming={false} now={NOW} />,
    )

    expect(container.querySelector('s')).toHaveTextContent('€13.99')
    expect(screen.getByText('Free')).toBeVisible()
})

test('a game free now without a known price only says Free', () => {
    const { container } = render(
        <GameCard
            game={{ ...game, originalPrice: null }}
            upcoming={false}
            now={NOW}
        />,
    )

    expect(container.querySelector('s')).toBeNull()
    expect(screen.getByText('Free')).toBeVisible()
})

test('a game free now says until when and how long is left', () => {
    render(<GameCard game={game} upcoming={false} now={NOW} />)

    expect(screen.getByText('Until 15 Oct · ends in 3 days')).toBeVisible()
})

test('a game whose giveaway is over says so instead of a negative time', () => {
    render(<GameCard game={game} upcoming={false} now={END.getTime() + HOUR} />)

    expect(screen.getByText('Until 15 Oct · ended')).toBeVisible()
})

test('an upcoming game says the dates it will be free between', () => {
    render(<GameCard game={game} upcoming={true} now={NOW} />)

    expect(screen.getByText('Free 8 Oct – 15 Oct')).toBeVisible()
})

test('an upcoming game shows no price and no time left: it is not free yet', () => {
    const { container } = render(
        <GameCard game={game} upcoming={true} now={NOW} />,
    )

    expect(container.querySelector('s')).toBeNull()
    expect(screen.queryByText('Free')).not.toBeInTheDocument()
    expect(screen.queryByText(/ends in/)).not.toBeInTheDocument()
})

test('shows the cover as a decorative image', () => {
    const { container } = render(
        <GameCard game={game} upcoming={false} now={NOW} />,
    )

    expect(cover(container)).toHaveAttribute('src', game.image)
    expect(cover(container)).toHaveAttribute('alt', '')
    expect(screen.queryByText('No cover')).not.toBeInTheDocument()
})

test('a game without a cover shows a placeholder', () => {
    const { container } = render(
        <GameCard game={{ ...game, image: null }} upcoming={false} now={NOW} />,
    )

    expect(cover(container)).toBeNull()
    expect(screen.getByText('No cover')).toBeVisible()
})

test('a cover that fails to load is replaced by the placeholder', () => {
    const { container } = render(
        <GameCard game={game} upcoming={false} now={NOW} />,
    )

    const image = cover(container)
    if (!image) throw new Error('expected a cover')
    fireEvent.error(image)

    expect(cover(container)).toBeNull()
    expect(screen.getByText('No cover')).toBeVisible()
})

test('after a failed cover, a different cover gets a fresh try', () => {
    const { container, rerender } = render(
        <GameCard game={game} upcoming={false} now={NOW} />,
    )
    const image = cover(container)
    if (!image) throw new Error('expected a cover')
    fireEvent.error(image)

    const other = 'https://cdn.example/out-of-sight-thumbnail.jpg'
    rerender(
        <GameCard
            game={{ ...game, image: other }}
            upcoming={false}
            now={NOW}
        />,
    )

    expect(cover(container)).toHaveAttribute('src', other)
})
