const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/**
 * The day and the month of a date, for example "8 Oct", in the time zone of
 * the person looking at the dashboard. The language is fixed because the
 * dashboard is English only: with the browser's own language the same widget
 * would read "8 oct" for one person and "Oct 8" for another.
 */
export function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
    })
}

/**
 * How long a giveaway still lasts, in words: "ends in 3 days", "ends in 5
 * hours", "ends in less than an hour" or "ended". Hours are used below two
 * days, where "ends in 1 days" would hide whether there are 25 hours left
 * or 47.
 *
 * `now` is a parameter (milliseconds, as Date.now() returns) instead of
 * being read here, so the same inputs always give the same answer.
 */
export function timeLeft(endsAt: string, now: number): string {
    const left = Date.parse(endsAt) - now

    if (left <= 0) return 'ended'
    if (left < HOUR) return 'ends in less than an hour'
    if (left < 2 * DAY) {
        const hours = Math.floor(left / HOUR)
        return `ends in ${hours} ${hours === 1 ? 'hour' : 'hours'}`
    }
    return `ends in ${Math.floor(left / DAY)} days`
}
