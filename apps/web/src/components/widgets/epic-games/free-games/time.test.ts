import { expect, test } from 'vitest'
import { shortDate, timeLeft } from './time'

const END = '2026-10-08T15:00:00.000Z'
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The moment that is `before` milliseconds ahead of END. */
function at(before: number): number {
    return Date.parse(END) - before
}

test.each([
    ['at the very end', 0, 'ended'],
    ['a minute after the end', -MINUTE, 'ended'],
    ['a week after the end', -7 * DAY, 'ended'],
    ['a second before the end', 1000, 'ends in less than an hour'],
    ['59 minutes before', 59 * MINUTE, 'ends in less than an hour'],
    ['exactly an hour before', HOUR, 'ends in 1 hour'],
    ['an hour and 59 minutes before', HOUR + 59 * MINUTE, 'ends in 1 hour'],
    ['two hours before', 2 * HOUR, 'ends in 2 hours'],
    ['five and a half hours before', 5 * HOUR + 30 * MINUTE, 'ends in 5 hours'],
    ['exactly a day before', DAY, 'ends in 24 hours'],
    ['a minute short of two days', 2 * DAY - MINUTE, 'ends in 47 hours'],
    ['exactly two days before', 2 * DAY, 'ends in 2 days'],
    ['three days and 23 hours before', 3 * DAY + 23 * HOUR, 'ends in 3 days'],
    ['a week before', 7 * DAY, 'ends in 7 days'],
    ['30 days before', 30 * DAY, 'ends in 30 days'],
])('%s: %s', (_name, before, expected) => {
    expect(timeLeft(END, at(before as number))).toBe(expected)
})

test('reads the end date whatever its time zone notation', () => {
    const now = Date.parse('2026-10-08T12:00:00.000Z')
    expect(timeLeft('2026-10-08T17:00:00+02:00', now)).toBe('ends in 3 hours')
})

// The dates are built in the time zone the tests run in, because shortDate
// answers in the viewer's time zone: the same moment is the 8th in Madrid and
// already the 9th in Auckland.
test.each([
    [new Date(2026, 9, 8, 17), '8 Oct'],
    [new Date(2026, 9, 15, 0, 30), '15 Oct'],
    [new Date(2026, 11, 10, 23, 59), '10 Dec'],
    [new Date(2027, 0, 7, 12), '7 Jan'],
])('shortDate of %s is %j', (date, expected) => {
    expect(shortDate(date.toISOString())).toBe(expected)
})
