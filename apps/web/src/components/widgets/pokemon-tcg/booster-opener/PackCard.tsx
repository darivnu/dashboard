import { useState } from 'react'
import type { PackCard as PackCardData } from './parse'

type Props = {
    card: PackCardData
    /** false while the card is face down. */
    revealed: boolean
    /** Called when the user asks to turn the card face up. */
    onReveal: () => void
}

// The back every face-down card shows: a fan-made redraw of the Pokémon card
// back by AtomicmonkeyTCG, loaded from where its author published it. The
// address asks the host for a 490 x 680 copy, twice the size a card is drawn
// at, instead of the 2 MB original.
const CARD_BACK_URL =
    'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/4f7705ec-8c49-4eed-a56e-c21f3985254c/dah43cy-a8e121cb-934a-40f6-97c7-fa2d77130dd5.png/v1/fill/w_490,h_680/pokemon_card_backside_in_high_resolution_by_atomicmonkeytcg_dah43cy-fullview.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9MTQyMCIsInBhdGgiOiIvZi80Zjc3MDVlYy04YzQ5LTRlZWQtYTU2ZS1jMjFmMzk4NTI1NGMvZGFoNDNjeS1hOGUxMjFjYi05MzRhLTQwZjYtOTdjNy1mYTJkNzcxMzBkZDUucG5nIiwid2lkdGgiOiI8PTEwMjQifV1dLCJhdWQiOlsidXJuOnNlcnZpY2U6aW1hZ2Uub3BlcmF0aW9ucyJdfQ.364HskpTM11MwvEzmMXHqIkEbcA318yjhAaLQ9LsH0E'

// What a face-down card shows: the same back for every card, so nothing
// gives away what is on the other side.
function CardBack() {
    // The picture lives on someone else's server. If it ever stops loading,
    // a back drawn here takes its place so the cards stay usable.
    const [broken, setBroken] = useState(false)

    if (!broken) {
        return (
            <img
                data-testid="card-back"
                src={CARD_BACK_URL}
                alt=""
                className="size-full object-contain"
                onError={() => setBroken(true)}
            />
        )
    }

    return (
        <div
            data-testid="drawn-card-back"
            className="flex size-full items-center justify-center rounded-lg border-4 border-blue-300 bg-linear-to-br from-blue-600 to-indigo-900"
        >
            <div className="flex size-1/2 items-center justify-center rounded-full border-4 border-white/80 bg-red-500">
                <div className="size-1/3 rounded-full border-4 border-white/80 bg-white/30" />
            </div>
        </div>
    )
}

export default function PackCard({ card, revealed, onReveal }: Props) {
    // The address of the picture that failed to load, so a different picture
    // gets a fresh try.
    const [brokenImage, setBrokenImage] = useState<string | null>(null)

    const image =
        card.image !== null && brokenImage !== card.image.low
            ? card.image
            : null
    // A reverse holo with a special pattern is named after the pattern.
    const print = card.reverseHolo ? (card.pattern ?? 'Reverse holo') : null

    return (
        <article className="flex flex-col gap-1">
            {/* The two faces sit back to back on a sheet that turns around
                its vertical axis. `perspective` is what makes the turn look
                like depth instead of a card getting narrower. */}
            <div className="perspective-distant relative aspect-[245/337] w-full">
                <div
                    data-testid="card-sheet"
                    className={`relative size-full transition-transform duration-500 transform-3d motion-reduce:transition-none ${revealed ? 'rotate-y-180' : ''}`}
                >
                    <div
                        aria-hidden="true"
                        className="backface-hidden absolute inset-0"
                    >
                        <CardBack />
                    </div>

                    <div className="backface-hidden absolute inset-0 rotate-y-180 overflow-hidden rounded-lg bg-surface-raised">
                        {/* The picture is in the page from the start so it
                            is already loaded when the card turns; it has no
                            text until then, so nothing reads it out early. */}
                        {image !== null && (
                            <img
                                src={image.low}
                                srcSet={`${image.low} 1x, ${image.high} 2x`}
                                alt={revealed ? card.name : ''}
                                className="size-full object-contain"
                                onError={() => setBrokenImage(image.low)}
                            />
                        )}
                        {image === null && revealed && (
                            <div className="flex size-full items-center justify-center p-2 text-center text-fg-secondary text-sm">
                                {card.name}
                            </div>
                        )}
                    </div>
                </div>

                {/* Lies over the face-down card and goes away once it is
                    turned. A real button, so Enter and Space work too. */}
                {!revealed && (
                    <button
                        type="button"
                        onClick={onReveal}
                        aria-label="Reveal card"
                        className="absolute inset-0 cursor-pointer rounded-lg transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
                    />
                )}
            </div>

            {revealed && (
                <p className="text-center text-fg-secondary text-xs">
                    {card.rarity}
                    {print !== null && (
                        <span className="ml-1 font-semibold text-info">
                            · {print}
                        </span>
                    )}
                </p>
            )}
        </article>
    )
}
