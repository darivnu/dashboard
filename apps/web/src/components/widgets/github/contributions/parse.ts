/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** parse
 */

export type ContributionDay = {
    /** "YYYY-MM-DD" */
    date: string
    /** 0 (Sunday) to 6 (Saturday): the row of the grid */
    weekday: number
    count: number
    /** 0 (none) to 4 (most), GitHub's quartiles */
    level: number
}

export type ContributionsData = {
    login: string
    /** contributions over the last year */
    total: number
    /** one array per week, oldest first: the columns of the grid */
    weeks: ContributionDay[][]
}

function fail(): never {
    throw new Error('Unexpected GitHub contributions data')
}

// The Eden client turns ISO date strings into Dates, "2026-10-04" included.
// Bring it back to the day it was.
function parseDate(value: unknown): string {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
    }
    if (typeof value === 'string') {
        return value
    }
    return fail()
}

function parseDay(raw: unknown): ContributionDay {
    if (typeof raw !== 'object' || raw === null) {
        return fail()
    }
    const { date, weekday, count, level } = raw as Record<string, unknown>
    if (typeof weekday !== 'number' || typeof count !== 'number' || typeof level !== 'number') {
        return fail()
    }
    return { date: parseDate(date), weekday, count, level }
}

export function parseContributions(raw: unknown): ContributionsData {
    if (typeof raw !== 'object' || raw === null) {
        return fail()
    }
    const { login, total, weeks } = raw as Record<string, unknown>
    if (typeof login !== 'string' || typeof total !== 'number') {
        return fail()
    }
    if (!Array.isArray(weeks) || !weeks.every(Array.isArray)) {
        return fail()
    }
    return { login, total, weeks: weeks.map((week) => week.map(parseDay)) }
}
