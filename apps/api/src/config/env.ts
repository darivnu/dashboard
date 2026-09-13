function required(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) {
      throw new Error(`Missing required environment variable: ${name}`)
    }
    return value
  }

  function optional(name: string, fallback: string): string {
    const value = process.env[name]?.trim()
    return value ? value : fallback
  }

  function positiveInteger(name: string, fallback: string): number {
    const raw = optional(name, fallback)
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Environment variable ${name} must be a positive integer, got "${raw}"`)
    }
    return parsed
  }

  export const env = {
    nodeEnv: optional('NODE_ENV', 'development'),
    port: positiveInteger('PORT', '8080'),
    databaseUrl: required('DATABASE_URL'),
    appUrl: required('APP_URL').replace(/\/+$/, ''),
    sessionTtlDays: positiveInteger('SESSION_TTL_DAYS', '30'),
  } as const

export const isDev = env.nodeEnv === 'development'