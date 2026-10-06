import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import PackCard from './PackCard'
import type { PackCard as PackCardData } from './parse'

const card: PackCardData = {
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

/** The picture of the card's own face, as opposed to the back every card shares. */
function facePicture(container: HTMLElement) {
    return container.querySelector('img:not([data-testid="card-back"])')
}

function faceDown(overrides: Partial<PackCardData> = {}) {
    const onReveal = vi.fn()
    const view = render(
        <PackCard
            card={{ ...card, ...overrides }}
            revealed={false}
            onReveal={onReveal}
        />,
    )
    return { onReveal, ...view }
}

function faceUp(overrides: Partial<PackCardData> = {}) {
    return render(
        <PackCard
            card={{ ...card, ...overrides }}
            revealed={true}
            onReveal={() => {}}
        />,
    )
}

test('a face-down card is a button that gives nothing away', () => {
    faceDown()

    expect(screen.getByRole('button', { name: 'Reveal card' })).toBeVisible()
    expect(screen.queryByText('Pineco')).toBeNull()
    expect(screen.queryByText('Common')).toBeNull()
    expect(screen.queryByAltText('Pineco')).toBeNull()
})

test('a face-down card without a picture does not show its name either', () => {
    faceDown({ image: null })

    expect(screen.queryByText('Pineco')).toBeNull()
})

test('the picture is fetched while the card is still face down', () => {
    const { container } = faceDown()

    expect(facePicture(container)).toHaveAttribute('src', card.image?.low)
})

test('a click asks to reveal the card', async () => {
    const { onReveal } = faceDown()

    await userEvent.click(screen.getByRole('button', { name: 'Reveal card' }))

    expect(onReveal).toHaveBeenCalledTimes(1)
})

test.each(['{Enter}', ' '])(
    'the key "%s" asks to reveal the card',
    async (key) => {
        const { onReveal } = faceDown()

        screen.getByRole('button', { name: 'Reveal card' }).focus()
        await userEvent.keyboard(key)

        expect(onReveal).toHaveBeenCalledTimes(1)
    },
)

test('the sheet is turned only once the card is revealed', () => {
    const { rerender } = faceDown()
    expect(screen.getByTestId('card-sheet')).not.toHaveClass('rotate-y-180')

    rerender(<PackCard card={card} revealed={true} onReveal={() => {}} />)

    expect(screen.getByTestId('card-sheet')).toHaveClass('rotate-y-180')
})

test('the turn is not animated for someone who prefers reduced motion', () => {
    faceDown()

    expect(screen.getByTestId('card-sheet')).toHaveClass(
        'motion-reduce:transition-none',
    )
})

test('a revealed card shows its picture in both sizes, named after the card', () => {
    faceUp()

    const picture = screen.getByAltText('Pineco')
    expect(picture).toHaveAttribute('src', card.image?.low)
    expect(picture).toHaveAttribute(
        'srcset',
        `${card.image?.low} 1x, ${card.image?.high} 2x`,
    )
})

test('a revealed card is no longer a button', () => {
    faceUp()

    expect(screen.queryByRole('button')).toBeNull()
})

test('a revealed card shows its rarity', () => {
    faceUp({ rarity: 'Special illustration rare' })

    expect(screen.getByText('Special illustration rare')).toBeVisible()
})

test('an ordinary card has no print label', () => {
    faceUp()

    expect(screen.queryByText(/Reverse holo/)).toBeNull()
})

test('a reverse holo card says so', () => {
    faceUp({ reverseHolo: true })

    expect(screen.getByText(/Reverse holo/)).toBeVisible()
})

test('a reverse holo with a pattern is named after the pattern', () => {
    faceUp({ reverseHolo: true, pattern: 'Master Ball' })

    expect(screen.getByText(/Master Ball/)).toBeVisible()
    expect(screen.queryByText(/Reverse holo/)).toBeNull()
})

test('a card without a picture shows its name on the placeholder', () => {
    const { container } = faceUp({ image: null })

    expect(facePicture(container)).toBeNull()
    expect(screen.getByText('Pineco')).toBeVisible()
})

test('a picture that fails to load is replaced by the name', () => {
    const { container } = faceUp()

    const picture = screen.getByAltText('Pineco')
    fireEvent.error(picture)

    expect(facePicture(container)).toBeNull()
    expect(screen.getByText('Pineco')).toBeVisible()
})

test('a different card gets a fresh try after a failed picture', () => {
    const { rerender } = faceUp()
    fireEvent.error(screen.getByAltText('Pineco'))

    const other: PackCardData = {
        ...card,
        id: 'sv01-002',
        name: 'Heracross',
        image: {
            low: 'https://assets.tcgdex.net/en/sv/sv01/002/low.webp',
            high: 'https://assets.tcgdex.net/en/sv/sv01/002/high.webp',
        },
    }
    rerender(<PackCard card={other} revealed={true} onReveal={() => {}} />)

    expect(screen.getByAltText('Heracross')).toHaveAttribute(
        'src',
        other.image?.low,
    )
})

test('a face-down card shows the card back picture', () => {
    faceDown()

    const back = screen.getByTestId('card-back')
    expect(back.getAttribute('src')).toContain(
        'pokemon_card_backside_in_high_resolution_by_atomicmonkeytcg',
    )
    expect(back).toHaveAttribute('alt', '')
})

test('a card back that fails to load is replaced by a drawn one', () => {
    faceDown()
    expect(screen.queryByTestId('drawn-card-back')).toBeNull()

    fireEvent.error(screen.getByTestId('card-back'))

    expect(screen.getByTestId('drawn-card-back')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal card' })).toBeVisible()
})
