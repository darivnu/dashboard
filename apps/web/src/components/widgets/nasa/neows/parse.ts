/*
 ** EPITECH PROJECT, 2026
 ** dashboard
 ** File description:
 ** parse
 */

export type Asteroid = {
    name: string
    /** NASA's own format, e.g. "2026-Oct-06 17:40" (UTC) */
    date: string
    distanceKm: number
    /** in lunar distances: 1 = the distance from the Earth to the Moon */
    distanceLunar: number
    diameterM: number
    hazardous: boolean
}

export type NeoData = {
    days: number
    count: number
    hazardousCount: number
    /** the closest ones first */
    asteroids: Asteroid[]
}

/** average distance from the Earth to the Moon, in km */
const LUNAR_KM = 384_400

function fail(): never {
    throw new Error('Unexpected near earth objects data')
}

function isNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function parseAsteroid(raw: unknown): Asteroid {
    if (typeof raw !== 'object' || raw === null) return fail()
    const { name, date, distanceKm, distanceLunar, diameterM, hazardous } =
        raw as Record<string, unknown>
    if (typeof name !== 'string' || typeof date !== 'string') return fail()
    if (!isNumber(distanceKm) || !isNumber(diameterM)) return fail()
    if (typeof hazardous !== 'boolean') return fail()
    return {
        name,
        date,
        distanceKm,
        // NaN reaches us as null: work it out from km instead of failing.
        distanceLunar: isNumber(distanceLunar)
            ? distanceLunar
            : distanceKm / LUNAR_KM,
        diameterM,
        hazardous,
    }
}

export function parseNeo(raw: unknown): NeoData {
    if (typeof raw !== 'object' || raw === null) return fail()
    const { days, count, hazardousCount, asteroids } = raw as Record<
        string,
        unknown
    >
    if (!isNumber(days) || !isNumber(count) || !isNumber(hazardousCount)) {
        return fail()
    }
    if (!Array.isArray(asteroids)) return fail()
    return {
        days,
        count,
        hazardousCount,
        asteroids: asteroids.map(parseAsteroid),
    }
}
