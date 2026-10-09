import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

// "Fact of the day": the /today endpoint returns the same fact for the whole
// day, which suits a dashboard card better than a value that changes on reload.
const TODAY_URL = 'https://uselessfacts.jsph.pl/api/v2/facts/today'

export type Fact = {
    text: string
    source: string | null
    sourceUrl: string | null
}

/** Keeps only the fields the widget draws; throws when the body is not a fact. */
export function parseFact(body: unknown): Fact {
    if (typeof body !== 'object' || body === null) {
        throw new Error('Facts: unexpected body')
    }
    const { text, source, source_url } = body as Record<string, unknown>
    if (typeof text !== 'string') {
        throw new Error('Facts: unexpected body')
    }
    return {
        text,
        source: typeof source === 'string' ? source : null,
        sourceUrl: typeof source_url === 'string' ? source_url : null,
    }
}

export const factsService: ServiceDef = {
    id: 'facts',
    name: 'Facts',
    auth: { kind: 'none' }, // public API, no key

    widgets: [
        {
            id: 'fact_of_the_day',
            name: 'Fact of the day',
            description: 'A curious fact, the same one all day',
            params: [],

            // The fact only changes once a day, so a gentle poll is plenty.
            refresh: { default: 3600, min: 1800 },

            async fetch(ctx) {
                const body = await ctx.http.json<unknown>(TODAY_URL, {
                    headers: { Accept: 'application/json' },
                })
                try {
                    return parseFact(body)
                } catch (cause) {
                    throw new WidgetFetchError(
                        'upstream_error',
                        'Facts: unexpected body',
                        { cause },
                    )
                }
            },
        },
    ],
}
