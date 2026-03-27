import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../database/schema'

let _db: PostgresJsDatabase<typeof schema> | null = null

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_, prop) {
    if (!_db) {
      const url = useRuntimeConfig().databaseUrl
      if (!url) throw new Error('DATABASE_URL is not configured (set NUXT_DATABASE_URL)')
      _db = drizzle(postgres(url, { connection: { statement_timeout: 5000 } }), { schema })
    }
    return (_db as any)[prop]
  },
})
