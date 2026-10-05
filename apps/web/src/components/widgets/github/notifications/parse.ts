/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** parse
 */

export type Notification = {
    title: string
    /** "owner/name" */
    repo: string
    repoUrl: string
    /** the issue or pull request page, or the repo page for other kinds */
    url: string
    /** GitHub's subject type: Issue, PullRequest, Release, ... */
    type: string
    /** why the user got it: mention, review_requested, assign, ... */
    reason: string
    /** ISO date, or '' when GitHub sent none */
    updatedAt: string
}

export type NotificationsData = {
    /** how many unread notifications we counted (at most 50) */
    count: number
    /** true when GitHub had a full page: there may be more than `count` */
    hasMore: boolean
    /** the most recent first, already cut to the widget's limit */
    items: Notification[]
}

function fail(): never {
    throw new Error('Unexpected GitHub notifications data')
}

function parseNotification(raw: unknown): Notification {
    if (typeof raw !== 'object' || raw === null) {
        return fail()
    }
    const { title, repo, repoUrl, url, type, reason, updatedAt } =
        raw as Record<string, unknown>
    const strings = [title, repo, repoUrl, url, type, reason, updatedAt]
    if (!strings.every((value) => typeof value === 'string')) {
        return fail()
    }
    return {
        title: title as string,
        repo: repo as string,
        repoUrl: repoUrl as string,
        url: url as string,
        type: type as string,
        reason: reason as string,
        updatedAt: updatedAt as string,
    }
}

export function parseNotifications(raw: unknown): NotificationsData {
    if (typeof raw !== 'object' || raw === null) {
        return fail()
    }
    const { count, hasMore, items } = raw as Record<string, unknown>
    if (typeof count !== 'number' || typeof hasMore !== 'boolean') {
        return fail()
    }
    if (!Array.isArray(items)) {
        return fail()
    }
    return { count, hasMore, items: items.map(parseNotification) }
}
