import type { WidgetViewProps } from '../../../widgetRegistry'
import GameCard from './GameCard'
import type { FreeGame, FreeGamesData } from './parse'

type SectionProps = {
    title: string
    games: FreeGame[]
    upcoming: boolean
    now: number
}

// One heading with its cards. Draws nothing for an empty list, so a week
// without announced games does not leave a heading over an empty space.
function Section({ title, games, upcoming, now }: SectionProps) {
    if (games.length === 0) return null

    return (
        <section>
            <h4 className="mb-2 font-semibold text-muted text-xs uppercase tracking-wide">
                {title}
            </h4>
            {/* As many columns as fit, each at least 10rem wide. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
                {games.map((game) => (
                    <GameCard
                        key={game.id}
                        game={game}
                        upcoming={upcoming}
                        now={now}
                    />
                ))}
            </div>
        </section>
    )
}

export default function FreeGames({ data }: WidgetViewProps<FreeGamesData>) {
    // Read once per draw and shared by every card. The widget is drawn again
    // at each refresh, which is often enough for a text that changes by the
    // hour.
    const now = Date.now()

    if (data.current.length === 0 && data.upcoming.length === 0) {
        return <p className="text-muted text-sm">No free games right now.</p>
    }

    return (
        <div className="flex flex-col gap-4">
            <Section
                title="Free now"
                games={data.current}
                upcoming={false}
                now={now}
            />
            <Section
                title="Coming soon"
                games={data.upcoming}
                upcoming={true}
                now={now}
            />
        </div>
    )
}
