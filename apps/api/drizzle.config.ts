import { defineConfig } from 'drizzle-kit'

const url = process.env.DATABASE_URL
if (!url) {
    throw new Error('DATABASE_URL is required to run drizzle-kit')
}

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema.ts',
    out: './drizzle',
    dbCredentials: { url },
    strict: true,
    verbose: true,
})