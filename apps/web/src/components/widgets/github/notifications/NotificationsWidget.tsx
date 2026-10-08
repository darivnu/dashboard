/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** NotificationsWidget
 */

import type { WidgetViewProps } from '../../../widgetRegistry'
import type { Notification, NotificationsData } from './parse'

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

// "3 hours ago", "yesterday", ... from an ISO date. '' when there is none.
function timeAgo(iso: string) {
    const then = Date.parse(iso)
    if (Number.isNaN(then)) {
        return ''
    }
    const minutes = Math.round((then - Date.now()) / 60_000)
    if (Math.abs(minutes) < 60) {
        return relative.format(minutes, 'minute')
    }
    const hours = Math.round(minutes / 60)
    if (Math.abs(hours) < 24) {
        return relative.format(hours, 'hour')
    }
    return relative.format(Math.round(hours / 24), 'day')
}

// GitHub's names are code-like ("review_requested", "PullRequest"): make them readable.
function humanize(value: string) {
    return value
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
}

function NotificationRow({ notification }: { notification: Notification }) {
    return (
        <li className="flex flex-col gap-1 rounded-lg bg-surface-inset px-3 py-2">
            <a
                href={notification.url}
                target="_blank"
                rel="noreferrer"
                className="truncate font-medium text-fg hover:underline"
                title={notification.title}
            >
                {notification.title}
            </a>
            <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                <a
                    href={notification.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:text-fg-secondary"
                >
                    {notification.repo}
                </a>
                <span className="shrink-0">
                    {humanize(notification.type)} ·{' '}
                    {humanize(notification.reason)}
                    {notification.updatedAt &&
                        ` · ${timeAgo(notification.updatedAt)}`}
                </span>
            </div>
        </li>
    )
}

export default function NotificationsWidget({
    data,
}: WidgetViewProps<NotificationsData>) {
    const total = data.hasMore ? `${data.count}+` : String(data.count)

    return (
        <div className="flex h-full flex-col gap-3">
            <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums text-fg">
                    {total}
                </span>
                <span className="text-sm text-fg-secondary">
                    unread notification{data.count === 1 ? '' : 's'}
                </span>
            </div>

            {data.items.length === 0 ? (
                <p className="text-sm text-muted">
                    All caught up. Nothing unread.
                </p>
            ) : (
                <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                    {data.items.map((notification) => (
                        <NotificationRow
                            key={`${notification.url}-${notification.updatedAt}-${notification.title}`}
                            notification={notification}
                        />
                    ))}
                </ul>
            )}
        </div>
    )
}
