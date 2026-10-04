/** One game that is free for a limited time, as the API sends it. */
export type FreeGame = {
    id: string
    title: string
    publisher: string | null
    /** The cover; always an https:// address when present. */
    image: string | null
    /** The page to open for the game; always an https:// address. */
    url: string
    /** The usual price as the store writes it, for example "€26.99". */
    originalPrice: string | null
    /** ISO 8601 dates: the period during which the game costs nothing. */
    startsAt: string
    endsAt: string
}

export type FreeGamesData = {
    /** Free right now, the one ending soonest first. */
    current: FreeGame[]
    /** Announced as free later, the one starting soonest first. */
    upcoming: FreeGame[]
}

function fail(): never {
    throw new Error('Unexpected free games data')
}

function isTextOrNull(value: unknown): value is string | null {
    return value === null || typeof value === 'string'
}

// These two values end up in an <a href> and an <img src>. Anything that is
// not https:// is refused, which also keeps out addresses such as
// "javascript:..." that would run code when clicked.
function isSecureAddress(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('https://')
}

// The date as ISO text, or null when the value is not a readable date. A
// date can arrive as text or as a Date object: the API client turns any text
// that looks like an ISO date into a Date before the widget sees it.
function isoDate(value: unknown): string | null {
    if (typeof value !== 'string' && !(value instanceof Date)) return null
    const date = new Date(value)
    // An unreadable date has NaN as its time.
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function parseGame(raw: unknown): FreeGame {
    if (typeof raw !== 'object' || raw === null) return fail()
    const {
        id,
        title,
        publisher,
        image,
        url,
        originalPrice,
        startsAt,
        endsAt,
    } = raw as Record<string, unknown>
    if (typeof id !== 'string' || id === '') return fail()
    if (typeof title !== 'string' || title === '') return fail()
    if (!isTextOrNull(publisher)) return fail()
    if (image !== null && !isSecureAddress(image)) return fail()
    if (!isSecureAddress(url)) return fail()
    if (!isTextOrNull(originalPrice)) return fail()
    const start = isoDate(startsAt)
    const end = isoDate(endsAt)
    if (start === null || end === null) return fail()
    return {
        id,
        title,
        publisher,
        image,
        url,
        originalPrice,
        startsAt: start,
        endsAt: end,
    }
}

function parseGames(raw: unknown): FreeGame[] {
    if (!Array.isArray(raw)) return fail()
    return raw.map(parseGame)
}

export function parseFreeGames(raw: unknown): FreeGamesData {
    if (typeof raw !== 'object' || raw === null) return fail()
    const { current, upcoming } = raw as Record<string, unknown>
    return { current: parseGames(current), upcoming: parseGames(upcoming) }
}
