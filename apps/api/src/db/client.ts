import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../config/env'
import * as schema from './schema'

export const client = postgres(env.databaseUrl, { max: 10 })

export const db = drizzle(client, { schema })

export type Db = typeof db