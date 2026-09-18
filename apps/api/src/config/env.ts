/*
** EPITECH PROJECT, 2026
** dashboard
** File description:
** env
*/

//this function is used to get the value of an environment variable, and throw an error if it is not set
function required(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
}

//this function is used to get the value of an environment variable, and return a fallback value if it is not set
function optional(name: string, fallback: string): string {
    const value = process.env[name]?.trim()
    return value ? value : fallback
}

//this function is used to get the value of an environment variable, and return a fallback value if it is not set, and throw an error if the value is not a positive integer
function positiveInteger(name: string, fallback: string): number {
    const raw = optional(name, fallback)
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Environment variable ${name} must be a positive integer, got "${raw}"`)
    }
    return parsed
}

function stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '')
}

//this function is used to parse a comma-separated list of origins into an array of strings
function parseOrigins(raw: string): string[] {
    return raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
}

const nodeEnv = optional('NODE_ENV', 'development')
const isProdEnv = nodeEnv === 'production' //weird ass way to see if 2 variables are equal to each other. I hate this language

const appUrl = stripTrailingSlash(required('APP_URL'))
// The origin the frontend is actually served from. Required in production
// (split-origin deploys); locally it falls back to APP_URL since Compose
// serves both from the same origin.
const webUrl = stripTrailingSlash(isProdEnv ? required('WEB_URL') : optional('WEB_URL', appUrl))

export const env = {
    nodeEnv,
    port: positiveInteger('PORT', '8080'),
    databaseUrl: required('DATABASE_URL'),
    appUrl,
    webUrl,
    corsOrigins: parseOrigins(optional('CORS_ORIGINS', webUrl)),
    sessionTtlDays: positiveInteger('SESSION_TTL_DAYS', '30'),
} as const

export const isDev = env.nodeEnv === 'development'
export const isProd = env.nodeEnv === 'production'
