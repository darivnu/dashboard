import { XMLParser } from "fast-xml-parser";
import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

const parser = new XMLParser({ ignoreAttributes: false });

export function extractPoster(description?: string): string | null {
    if (!description) return null;
    const m = description.match(/<img[^>]+src="([^"]+)"/);
    return m ? m[1] : null;
}

export function parseLetterboxdRss(xml: string, limit: number) {
    const feed = parser.parse(xml);

    const channel = feed?.rss?.channel;
    if (!channel) throw new Error("Letterboxd: feed no válido (¿username correcto?)");

    const raw = channel.item ?? [];
    const items = Array.isArray(raw) ? raw : [raw];

    return items.slice(0, limit).map((item) => ({
    film: item["letterboxd:filmTitle"] ?? null,
    year: item["letterboxd:filmYear"] ?? null,
    rating: item["letterboxd:memberRating"] != null
        ? Number(item["letterboxd:memberRating"])
        : null,
    watchedDate: item["letterboxd:watchedDate"] ?? null,
    rewatch: item["letterboxd:rewatch"] === "Yes",
    poster: extractPoster(item.description),
    link: item.link ?? null,
    }));
}

// Límites del param limit. El feed de Letterboxd nunca trae más de 50 pelis.
const MIN_FILMS = 1
const MAX_FILMS = 50
const DEFAULT_FILMS = 5

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

export const letterboxdService: ServiceDef = {
    id: 'letterboxd',
    name: 'Letterboxd',
    auth: { kind: 'none' },     // el RSS del diario es público → sin credenciales

    widgets: [
        {
            id: 'recent_films',
            name: 'Recent films',
            description: "A member's most recently watched films from their public diary",
            params: [
                {
                    name: 'username',
                    label: 'Letterboxd username (e.g. "davidehrlich")',
                    type: 'string',
                    required: true,
                },
                {
                    name: 'limit',
                    label: `How many films to show (${MIN_FILMS}-${MAX_FILMS})`,
                    type: 'integer',
                    default: DEFAULT_FILMS,
                },
            ],

            // El feed solo cambia cuando el miembro registra una peli → sondeo suave.
            refresh: { default: 1800, min: 300 },

            async fetch(ctx, params) {
                const username = String(params.username).trim()
                const limit = clamp(Number(params.limit), MIN_FILMS, MAX_FILMS)
                const url = `https://letterboxd.com/${encodeURIComponent(username)}/rss/`

                const xml = await ctx.http.text(url)

                try {
                    return { films: parseLetterboxdRss(xml, limit) }
                } catch (cause) {
                    throw new WidgetFetchError('invalid_config', 'Letterboxd: feed no válido (¿username correcto?)', { cause })
                }
            },
        },
    ],
}