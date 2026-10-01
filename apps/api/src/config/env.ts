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
//this to allow for multiple origins to be specified in the CORS_ORIGINS environment variable
function parseOrigins(raw: string): string[] {
    return raw
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
}

const MASTER_KEY_BYTES = 32

//this function is used to read the key that encrypts stored credentials (AES-256-GCM, see lib/crypto.ts)
//no fallback on purpose: a missing or malformed key must stop the boot in every environment
//the error never includes the value, so a wrong key can't end up in the logs (duuhh)
function masterKey(): Buffer {
    const key = Buffer.from(required('MASTER_KEY'), 'base64')
    if (key.length !== MASTER_KEY_BYTES) {
        throw new Error(`MASTER_KEY must be ${MASTER_KEY_BYTES} bytes encoded in base64 (generate one with: openssl rand -base64 32)`)
    }
    return key
}

export interface SmtpConfig {
    host: string
    port: number
    user: string
    pass: string
    /** Sender as it appears in the mail, e.g. `Dashboard <hello@example.com>`. */
    from: string
}

// All-or-nothing group. No SMTP_HOST means mails are printed to the console.
// Once SMTP_HOST is set, the rest is required, so a half-configured relay
// fails here at boot instead of on the first registration.
function smtpConfig(): SmtpConfig | null {
    const host = optional('SMTP_HOST', '')
    if (host === '') return null

    return {
        host,
        port: positiveInteger('SMTP_PORT', '587'),
        user: required('SMTP_USER'),
        pass: required('SMTP_PASS'),
        from: required('MAIL_FROM'),
    }
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
    masterKey: masterKey(),
    smtp: smtpConfig(),
} as const

export const isDev = env.nodeEnv === 'development'
export const isProd = env.nodeEnv === 'production'
