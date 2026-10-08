/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** NeoWidget
 */

import type { WidgetViewProps } from '../../../widgetRegistry'
import type { Asteroid, NeoData } from './parse'

const compact = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
})

// NASA names look like "(2010 SJ)": the brackets add nothing on screen.
function displayName(name: string) {
    return name.replace(/^\((.*)\)$/, '$1')
}

// "2026-Oct-06 17:40" -> "Oct 06 · 17:40". Anything else is shown as is.
function displayDate(date: string) {
    const match = /^\d{4}-(\w{3})-(\d{2}) (\d{2}:\d{2})$/.exec(date)
    return match ? `${match[1]} ${match[2]} · ${match[3]}` : date
}

function HazardBadge({ count }: { count: number }) {
    if (count === 0) {
        return (
            <span className="rounded-full bg-success-subtle px-2.5 py-1 text-xs font-medium text-success-fg ring-1 ring-success-border">
                None hazardous
            </span>
        )
    }
    return (
        <span className="rounded-full bg-danger-subtle px-2.5 py-1 text-xs font-medium text-danger-fg ring-1 ring-danger-border">
            {count} potentially hazardous
        </span>
    )
}

function AsteroidRow({
    asteroid,
    farthest,
}: {
    asteroid: Asteroid
    farthest: number
}) {
    // Where the asteroid sits on the track from the Earth (left) to the
    // farthest one shown (right). Kept off the very edges so the dot stays visible.
    const position = Math.min(
        96,
        Math.max(4, (asteroid.distanceLunar / farthest) * 100),
    )
    const dot = asteroid.hazardous ? 'bg-danger' : 'bg-info'

    return (
        <li className="flex flex-col gap-1.5 rounded-lg bg-surface-inset px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                    <span
                        className={`h-2 w-2 shrink-0 rounded-full ${dot}`}
                        aria-hidden="true"
                    />
                    <span className="truncate font-medium text-fg">
                        {displayName(asteroid.name)}
                    </span>
                    {asteroid.hazardous && (
                        <span className="sr-only">(potentially hazardous)</span>
                    )}
                </span>
                <span className="shrink-0 text-xs text-muted">
                    {displayDate(asteroid.date)}
                </span>
            </div>

            <div
                className="relative h-1.5 rounded-full bg-gradient-to-r from-info/40 via-neutral to-neutral"
                aria-hidden="true"
            >
                <span
                    className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${dot}`}
                    style={{ left: `${position}%` }}
                />
            </div>

            <div className="flex justify-between text-xs text-muted">
                <span>~{compact.format(asteroid.diameterM)} m wide</span>
                <span title={`${compact.format(asteroid.distanceKm)} km`}>
                    <span className="text-fg-secondary">
                        {asteroid.distanceLunar.toFixed(1)}×
                    </span>{' '}
                    Moon distance
                </span>
            </div>
        </li>
    )
}

export default function NeoWidget({ data }: WidgetViewProps<NeoData>) {
    const farthest = Math.max(1, ...data.asteroids.map((a) => a.distanceLunar))
    const period = data.days === 1 ? 'today' : `in the next ${data.days} days`

    return (
        <div className="flex h-full flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums text-fg">
                        {data.count}
                    </span>
                    <span className="text-sm text-fg-secondary">
                        {data.count === 1
                            ? 'asteroid passes'
                            : 'asteroids pass'}{' '}
                        Earth {period}
                    </span>
                </div>
                <HazardBadge count={data.hazardousCount} />
            </div>

            {data.asteroids.length === 0 ? (
                <p className="text-sm text-muted">
                    Nothing close by. Quiet skies.
                </p>
            ) : (
                <>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Closest approaches
                    </h4>
                    <ul className="flex flex-col gap-2">
                        {data.asteroids.map((asteroid) => (
                            <AsteroidRow
                                key={`${asteroid.name}-${asteroid.date}`}
                                asteroid={asteroid}
                                farthest={farthest}
                            />
                        ))}
                    </ul>
                </>
            )}
        </div>
    )
}
