import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as schema from '../../server/database/schema'

const migrationPath = resolve(__dirname, '../../server/database/migrations/0000_redundant_thor.sql')

describe('github user upsert', () => {
  let pg: InstanceType<typeof PGlite>
  let testDb: ReturnType<typeof drizzle<typeof schema>>

  beforeAll(async () => {
    pg = new PGlite()

    const sql = readFileSync(migrationPath, 'utf-8')
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
    for (const stmt of statements) {
      await pg.exec(stmt)
    }

    testDb = drizzle(pg, { schema })
  })

  afterAll(async () => {
    await pg.close()
  })

  it('inserts a new user on first GitHub login', async () => {
    const [user] = await testDb.insert(schema.users).values({
      githubId: 99999,
      username: 'newuser',
      displayName: 'New User',
      avatarUrl: 'https://avatars.githubusercontent.com/u/99999',
      encryptedGithubToken: 'encrypted-token-value',
    }).returning()

    expect(user.username).toBe('newuser')
    expect(user.githubId).toBe(99999)
    expect(user.displayName).toBe('New User')
  })

  it('updates user on conflict (same githubId)', async () => {
    const [user] = await testDb
      .insert(schema.users)
      .values({
        githubId: 99999,
        username: 'newuser-renamed',
        displayName: 'Updated Name',
        avatarUrl: 'https://avatars.githubusercontent.com/u/99999?v=2',
        encryptedGithubToken: 'new-encrypted-token',
      })
      .onConflictDoUpdate({
        target: schema.users.githubId,
        set: {
          username: 'newuser-renamed',
          displayName: 'Updated Name',
          avatarUrl: 'https://avatars.githubusercontent.com/u/99999?v=2',
          encryptedGithubToken: 'new-encrypted-token',
        },
      })
      .returning()

    expect(user.username).toBe('newuser-renamed')
    expect(user.displayName).toBe('Updated Name')

    // Verify only one user with this githubId
    const allUsers = await testDb.select().from(schema.users).where(eq(schema.users.githubId, 99999))
    expect(allUsers).toHaveLength(1)
  })

  it('rejects duplicate githubId without conflict handling', async () => {
    await expect(
      testDb.insert(schema.users).values({
        githubId: 99999,
        username: 'duplicate',
        displayName: 'Duplicate',
      }).execute(),
    ).rejects.toThrow()
  })
})
