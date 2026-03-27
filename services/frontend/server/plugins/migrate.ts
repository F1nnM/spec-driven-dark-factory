import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const MAX_RETRIES = 10
const RETRY_DELAY_MS = 2000

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default defineNitroPlugin(async () => {
  const url = useRuntimeConfig().databaseUrl
  if (!url) {
    console.warn('[migrate] DATABASE_URL not configured, skipping migrations')
    return
  }

  const client = postgres(url, { max: 1 })
  const db = drizzle(client)

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[migrate] Running migrations (attempt ${attempt}/${MAX_RETRIES})...`)
      await migrate(db, { migrationsFolder: 'server/database/migrations' })
      console.log('[migrate] Migrations completed successfully')
      await client.end()
      return
    }
    catch (error) {
      console.error(`[migrate] Attempt ${attempt} failed:`, error)
      if (attempt < MAX_RETRIES) {
        console.log(`[migrate] Retrying in ${RETRY_DELAY_MS}ms...`)
        await sleep(RETRY_DELAY_MS)
      }
    }
  }

  await client.end()
  throw new Error(`[migrate] Failed after ${MAX_RETRIES} attempts`)
})
