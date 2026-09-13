import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { env } from '../config/env'

const client = postgres(env.databaseUrl, { max: 1 })
const db = drizzle(client)

console.log('Applying migrations from ./drizzle')
await migrate(db, { migrationsFolder: './drizzle' })
await client.end()
console.log('Migrations applied')