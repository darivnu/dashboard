/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** ContributionsWidget
 */

import type { WidgetViewProps } from '../../../widgetRegistry'
import type { ContributionDay, ContributionsData } from './parse'

// GitHub's dark theme greens, from no contribution (0) to the most (4)
const LEVEL_COLORS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']

const CELL = 10
const GAP = 3
const STEP = CELL + GAP
// room above the grid for the month names
const TOP = 14

const monthName = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })

function colorFor(level: number) {
    return LEVEL_COLORS[level] ?? LEVEL_COLORS[0]
}

// "28 contributions on Sunday, Oct 4, 2026", shown when hovering a cell
function describe(day: ContributionDay) {
    const when = new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    })
    const what = day.count === 0 ? 'No contributions' : `${day.count} contribution${day.count === 1 ? '' : 's'}`
    return `${what} on ${when}`
}

// A month name over the first week that starts in it, like the profile page does
function monthLabels(weeks: ContributionDay[][]) {
    const labels: { x: number; text: string }[] = []
    let previous = ''
    weeks.forEach((week, index) => {
        const first = week[0]
        if (!first?.date) {
            return
        }
        const text = monthName.format(new Date(`${first.date}T00:00:00Z`))
        if (text !== previous && index < weeks.length - 1) {
            labels.push({ x: index * STEP, text })
        }
        previous = text
    })
    // the first column is often a partial month: drop its label when the next one would overlap it
    if (labels.length > 1 && labels[1].x - labels[0].x < STEP * 3) {
        labels.shift()
    }
    return labels
}

function Graph({ weeks }: { weeks: ContributionDay[][] }) {
    const width = weeks.length * STEP - GAP
    const height = TOP + 7 * STEP - GAP

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Contribution graph">
            {monthLabels(weeks).map((label) => (
                <text key={label.x} x={label.x} y={9} className="fill-gray-400" fontSize={9}>
                    {label.text}
                </text>
            ))}
            {weeks.map((week, column) =>
                week.map((day) => (
                    <rect
                        key={day.date}
                        x={column * STEP}
                        y={TOP + day.weekday * STEP}
                        width={CELL}
                        height={CELL}
                        rx={2}
                        fill={colorFor(day.level)}
                    >
                        <title>{describe(day)}</title>
                    </rect>
                )),
            )}
        </svg>
    )
}

function Legend() {
    return (
        <div className="flex items-center gap-1 text-xs text-gray-400">
            <span className="mr-1">Less</span>
            {LEVEL_COLORS.map((color) => (
                <span key={color} className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
            ))}
            <span className="ml-1">More</span>
        </div>
    )
}

export default function ContributionsWidget({ data }: WidgetViewProps<ContributionsData>) {
    return (
        <div className="flex h-full flex-col gap-3">
            <a
                href={`https://github.com/${data.login}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 self-start hover:underline"
            >
                <img
                    src={`https://github.com/${data.login}.png?size=64`}
                    alt=""
                    className="h-8 w-8 rounded-full bg-gray-800"
                />
                <span className="font-semibold text-white">{data.login}</span>
            </a>

            <p className="text-sm text-gray-300">
                <span className="font-bold tabular-nums text-white">{data.total.toLocaleString('en')}</span>{' '}
                contribution{data.total === 1 ? '' : 's'} in the last year
            </p>

            <div className="rounded-lg bg-gray-900/40 p-3">
                <Graph weeks={data.weeks} />
            </div>

            <div className="flex justify-end">
                <Legend />
            </div>
        </div>
    )
}
