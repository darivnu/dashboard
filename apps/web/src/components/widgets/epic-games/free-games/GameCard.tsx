import { useState } from 'react'
import type { FreeGame } from './parse'
import { shortDate, timeLeft } from './time'

type Props = {
    game: FreeGame
    /** true for a game announced as free later, false for one free right now. */
    upcoming: boolean
    /** The current moment in milliseconds, as Date.now() returns. */
    now: number
}

export default function GameCard({ game, upcoming, now }: Props) {
    // The address of the cover that failed to load, so a different cover
    // gets a fresh try.
    const [brokenImage, setBrokenImage] = useState<string | null>(null)

    const showImage = game.image !== null && brokenImage !== game.image

    return (
        <article className="flex flex-col overflow-hidden rounded-lg bg-surface-raised">
            {/* The cover opens the store page too, for the mouse only: the
                title below is the link keyboards and screen readers use, so
                the same destination is not announced twice. */}
            {/* biome-ignore lint/a11y/useAnchorContent: hidden on purpose, the title is the accessible link */}
            <a
                href={game.url}
                target="_blank"
                rel="noreferrer"
                aria-hidden="true"
                tabIndex={-1}
            >
                {showImage ? (
                    <img
                        src={game.image ?? undefined}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-full bg-neutral object-cover"
                        onError={() => setBrokenImage(game.image)}
                    />
                ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-neutral text-muted text-xs">
                        No cover
                    </div>
                )}
            </a>

            <div className="flex flex-col gap-1 p-2 text-sm">
                <a
                    href={game.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-fg hover:underline"
                >
                    {game.title}
                </a>

                {game.publisher !== null && (
                    <p className="truncate text-muted text-xs">
                        {game.publisher}
                    </p>
                )}

                {!upcoming && (
                    <p>
                        {game.originalPrice !== null && (
                            <s className="mr-2 text-muted">
                                {game.originalPrice}
                            </s>
                        )}
                        <span className="font-semibold text-success-fg">
                            Free
                        </span>
                    </p>
                )}

                <p className="text-fg-secondary text-xs">
                    {upcoming
                        ? `Free ${shortDate(game.startsAt)} – ${shortDate(game.endsAt)}`
                        : `Until ${shortDate(game.endsAt)} · ${timeLeft(game.endsAt, now)}`}
                </p>
            </div>
        </article>
    )
}
