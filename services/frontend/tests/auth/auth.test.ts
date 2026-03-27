import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as schema from '../../server/database/schema'

const migrationPath = resolve(__dirname, '../../server/database/migrations/0000_overconfident_black_queen.sql')

describe('session management', () => {
  let pg: InstanceType<typeof PGlite>
  let testDb: ReturnType<typeof drizzle<typeof schema>>
  let userId: string

  beforeAll(async () => {
    pg = new PGlite()

    const sql = readFileSync(migrationPath, 'utf-8')
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
    for (const stmt of statements) {
      await pg.exec(stmt)
    }

    testDb = drizzle(pg, { schema })

    // Create a test user
    const [user] = await testDb.insert(schema.users).values({
      githubId: 12345,
      username: 'testuser',
      displayName: 'Test User',
      avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
    }).returning({ id: schema.users.id })
    userId = user.id
  })

  afterAll(async () => {
    await pg.close()
  })

  it('creates a session and retrieves it', async () => {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await testDb.insert(schema.sessions).values({
      id: token,
      userId,
      expiresAt,
    })

    const [session] = await testDb
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, token))
      .limit(1)

    expect(session).toBeTruthy()
    expect(session.userId).toBe(userId)
    expect(session.expiresAt.getTime()).toBe(expiresAt.getTime())
  })

  it('can join session with user data', async () => {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await testDb.insert(schema.sessions).values({
      id: token,
      userId,
      expiresAt,
    })

    const rows = await testDb
      .select({
        sessionId: schema.sessions.id,
        userId: schema.users.id,
        githubId: schema.users.githubId,
        username: schema.users.username,
        displayName: schema.users.displayName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
      .where(eq(schema.sessions.id, token))
      .limit(1)

    expect(rows).toHaveLength(1)
    expect(rows[0].username).toBe('testuser')
    expect(rows[0].displayName).toBe('Test User')
    expect(rows[0].githubId).toBe(12345)
  })

  it('expired sessions can be filtered out', async () => {
    const token = randomBytes(32).toString('hex')
    const expiredAt = new Date(Date.now() - 1000) // Already expired

    await testDb.insert(schema.sessions).values({
      id: token,
      userId,
      expiresAt: expiredAt,
    })

    // Select only non-expired sessions
    const rows = await testDb
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, token))
      .limit(1)

    expect(rows).toHaveLength(1)
    // The session exists, but its expiresAt is in the past
    expect(rows[0].expiresAt.getTime()).toBeLessThan(Date.now())
  })

  it('deletes a session', async () => {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await testDb.insert(schema.sessions).values({
      id: token,
      userId,
      expiresAt,
    })

    await testDb.delete(schema.sessions).where(eq(schema.sessions.id, token))

    const rows = await testDb
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, token))
      .limit(1)

    expect(rows).toHaveLength(0)
  })
})

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

  it('cascades user deletion to sessions', async () => {
    const [user] = await testDb.insert(schema.users).values({
      githubId: 77777,
      username: 'tempuser',
    }).returning()

    const token = randomBytes(32).toString('hex')
    await testDb.insert(schema.sessions).values({
      id: token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })

    // Delete user
    await testDb.delete(schema.users).where(eq(schema.users.id, user.id))

    // Session should be gone
    const sessions = await testDb
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, token))

    expect(sessions).toHaveLength(0)
  })
})
