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

// The contribution graph of a profile page is not in the REST API, only in GraphQL.
// Without from/to, contributionsCollection covers the last year, like the profile does
const CALENDAR_QUERY = `query {
    viewer {
        login
        contributionsCollection {
            contributionCalendar {
                totalContributions
                weeks { contributionDays { date weekday contributionCount contributionLevel } }
            }
        }
    }
}`

// GitHub's quartiles, turned into the 0-4 scale the profile grid uses for its five shades of green
const LEVELS: Record<string, number> = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4,
}

type GitHubCalendarResponse = {
    errors?: { message?: string }[]
    data?: {
        viewer?: {
            login?: string
            contributionsCollection?: {
                contributionCalendar?: {
                    totalContributions?: number
                    weeks?: {
                        contributionDays?: {
                            date?: string
                            weekday?: number
                            contributionCount?: number
                            contributionLevel?: string
                        }[]
                    }[]
                }
            }
        }
    }
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
                        'X-GitHub-Api-Version': '2022-11-28', //thats the default api version
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
        {
            id: 'contribution_stat_card',
            name: 'Contribution Stat card',
            description: 'Your GitHub contribution stats for the last year',
            params: [],
            refresh: { default: 3600, min: 300 },
            async fetch(ctx) {
                if (!ctx.getAccessToken)
                    throw new WidgetFetchError('needs_reauth', 'GitHub: no account connected')
                const token = await ctx.getAccessToken()

                //GraphQL answers 200 even when the query fails, so errors have to be read from the body
                const body = await ctx.http.json<GitHubCalendarResponse>('https://api.github.com/graphql', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ query: CALENDAR_QUERY }),
                })
                if (body.errors?.length)
                    throw new WidgetFetchError('upstream_error', `GitHub: ${body.errors[0]?.message ?? 'query failed'}`)
                const calendar = body.data?.viewer?.contributionsCollection?.contributionCalendar
                if (!calendar || !Array.isArray(calendar.weeks))
                    throw new WidgetFetchError('upstream_error', 'GitHub: unexpected body')

                //one array per week (a column of the grid), each day sorted Sunday to Saturday
                const weeks = calendar.weeks.map((week) =>
                    (week.contributionDays ?? []).map((day) => ({
                        date: day.date ?? '',
                        weekday: day.weekday ?? 0,
                        count: day.contributionCount ?? 0,
                        level: LEVELS[day.contributionLevel ?? 'NONE'] ?? 0, //0 (none) to 4 (most), the frontend picks the colours
                    })),
                )

                return {
                    login: body.data?.viewer?.login ?? '',
                    total: calendar.totalContributions ?? 0,
                    weeks,
                }
            },
        },
    ],
}
