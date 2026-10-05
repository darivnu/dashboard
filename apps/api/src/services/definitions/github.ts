/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** github
*/

import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

// GitHub's /notifications answers at most 50 per page. We always ask for a full page,
// so the widget can say how many are unread even when it only lists a few of them
const PAGE_SIZE = 50

type GitHubNotification = {
    reason?: string
    updated_at?: string
    subject?: { title?: string; type?: string; url?: string | null }
    repository?: { full_name?: string; html_url?: string }
}

// The API links to itself (https://api.github.com/repos/o/r/pulls/1), not to the page a person
// wants (https://github.com/o/r/pull/1). Issues and pull requests are easy to convert;
// for anything else (releases, discussions, ...) we fall back to the repository page
function toWebUrl(apiUrl: string | null | undefined, repoUrl: string): string {
    const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/(issues|pulls)\/(\d+)$/.exec(apiUrl ?? '')
    if (!match)
        return repoUrl
    const [, repo, kind, number] = match
    return `https://github.com/${repo}/${kind === 'pulls' ? 'pull' : 'issues'}/${number}`
}

export const githubService: ServiceDef = {
    id: 'github',
    name: 'GitHub',
    auth: { kind: 'oauth2', provider: 'github', scopes: ['notifications'] },
    widgets: [
        {
            id: 'notifications',
            name: 'Notifications',
            description: 'Your unread GitHub notifications',
            params: [{ name: 'limit', label: 'How many to show', type: 'integer', min: 1, max: 20, default: 5 }],
            refresh: { default: 300, min: 120 },
            async fetch(ctx, params) {
                if (!ctx.getAccessToken)
                    throw new WidgetFetchError('needs_reauth', 'GitHub: no account connected')
                const token = await ctx.getAccessToken()
                const limit = Number(params.limit)

                //401 (token revoked) becomes needs_reauth in the http client, so the user gets a Reconnect button
                const body = await ctx.http.json<unknown>(`https://api.github.com/notifications?per_page=${PAGE_SIZE}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28',
                    },
                })
                if (!Array.isArray(body))
                    throw new WidgetFetchError('upstream_error', 'GitHub: unexpected body')

                const items = (body as GitHubNotification[]).map((n) => {
                    const repo = n.repository?.full_name
                    const repoUrl = n.repository?.html_url
                    const title = n.subject?.title
                    if (typeof repo !== 'string' || typeof repoUrl !== 'string' || typeof title !== 'string')
                        throw new WidgetFetchError('upstream_error', 'GitHub: unexpected notification')
                    return {
                        title,
                        repo,
                        repoUrl,
                        url: toWebUrl(n.subject?.url, repoUrl),
                        type: n.subject?.type ?? 'Unknown', //Issue, PullRequest, Release, ...
                        reason: n.reason ?? 'unknown', //mention, review_requested, assign, ...
                        updatedAt: n.updated_at ?? '',
                    }
                })

                return {
                    count: items.length,
                    hasMore: items.length === PAGE_SIZE, //a full page: there may be more than we counted
                    items: items.slice(0, limit),
                }
            },
        },
    ],
}
