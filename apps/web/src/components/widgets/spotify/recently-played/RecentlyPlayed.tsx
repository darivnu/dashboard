/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** RecentlyPlayed
 */

import type { WidgetViewProps } from '../../../widgetRegistry'
import type { PlayedTrack, RecentlyPlayedData } from './parse'

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

// "5 minutes ago", "3 hours ago", "yesterday", ... from an ISO date.
function timeAgo(iso: string) {
    // Never closer than a minute ago: a play a few seconds old would read
    // "this minute", and one "in the future" (a browser clock running slow)
    // would read "in 2 minutes".
    const minutes = Math.min(
        -1,
        Math.round((Date.parse(iso) - Date.now()) / 60_000),
    )
    if (Math.abs(minutes) < 60) {
        return relative.format(minutes, 'minute')
    }
    const hours = Math.round(minutes / 60)
    if (Math.abs(hours) < 24) {
        return relative.format(hours, 'hour')
    }
    return relative.format(Math.round(hours / 24), 'day')
}

const ROW = 'flex items-center gap-3 rounded-lg bg-surface-inset px-3 py-2'

function TrackRow({ track }: { track: PlayedTrack }) {
    const content = (
        <>
            {track.cover !== null && (
                <img
                    src={track.cover}
                    alt=""
                    loading="lazy"
                    className="size-10 shrink-0 rounded object-cover"
                />
            )}
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg" title={track.title}>
                    {track.title}
                </p>
                {track.artists.length > 0 && (
                    <p className="truncate text-xs text-muted">
                        {track.artists.join(', ')}
                    </p>
                )}
            </div>
            <time
                dateTime={track.playedAt}
                className="shrink-0 text-xs text-muted"
            >
                {timeAgo(track.playedAt)}
            </time>
        </>
    )

    return (
        <li>
            {track.url === null ? (
                <div className={ROW}>{content}</div>
            ) : (
                <a
                    href={track.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`${ROW} hover:bg-surface-raised`}
                >
                    {content}
                </a>
            )}
        </li>
    )
}

export default function RecentlyPlayed({
    data,
}: WidgetViewProps<RecentlyPlayedData>) {
    if (data.tracks.length === 0) {
        return <p className="text-sm text-muted">Nothing played recently.</p>
    }

    return (
        <ul className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
            {data.tracks.map((track) => (
                <TrackRow
                    key={`${track.playedAt}-${track.title}`}
                    track={track}
                />
            ))}
        </ul>
    )
}
