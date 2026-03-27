import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as schema from '../../server/database/schema'
import { hashPassword, verifyPassword } from '../../server/utils/password'

const migrationPath = resolve(__dirname, '../../server/database/migrations/0000_mushy_edwin_jarvis.sql')

describe('password hashing', () => {
  it('hashes and verifies a password round-trip', async () => {
    const password = 'mysecurepassword'
    const hash = await hashPassword(password)
    expect(hash).not.toEqual(password)
    expect(hash).toContain(':')
    const valid = await verifyPassword(password, hash)
    expect(valid).toBe(true)
  })

  it('produces different hashes for the same password (salted)', async () => {
    const password = 'samepassword'
    const hash1 = await hashPassword(password)
    const hash2 = await hashPassword(password)
    expect(hash1).not.toEqual(hash2)
    // Both should still verify
    expect(await verifyPassword(password, hash1)).toBe(true)
    expect(await verifyPassword(password, hash2)).toBe(true)
  })

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correctpassword')
    const valid = await verifyPassword('wrongpassword', hash)
    expect(valid).toBe(false)
  })
})

describe('auth database operations', () => {
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

  it('registers a user and stores hashed password', async () => {
    const password = 'testpassword123'
    const passwordHash = await hashPassword(password)

    const [user] = await testDb.insert(schema.users).values({
      email: 'alice@example.com',
      passwordHash,
      name: 'Alice',
    }).returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
    })

    expect(user.email).toBe('alice@example.com')
    expect(user.name).toBe('Alice')
    expect(user.id).toBeTruthy()

    // Verify the stored hash works
    const [stored] = await testDb.select().from(schema.users).where(eq(schema.users.email, 'alice@example.com'))
    expect(await verifyPassword(password, stored.passwordHash)).toBe(true)
  })

  it('looks up user by email for login', async () => {
    const [user] = await testDb.select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      passwordHash: schema.users.passwordHash,
    }).from(schema.users).where(eq(schema.users.email, 'alice@example.com')).limit(1)

    expect(user).toBeTruthy()
    expect(user.email).toBe('alice@example.com')
    expect(user.name).toBe('Alice')
    expect(await verifyPassword('testpassword123', user.passwordHash)).toBe(true)
  })

  it('returns empty for non-existent email', async () => {
    const results = await testDb.select().from(schema.users).where(eq(schema.users.email, 'nobody@example.com')).limit(1)
    expect(results).toHaveLength(0)
  })

  it('rejects duplicate email registration', async () => {
    const passwordHash = await hashPassword('anotherpassword')

    await expect(
      testDb.insert(schema.users).values({
        email: 'alice@example.com',
        passwordHash,
        name: 'Alice Duplicate',
      }).execute(),
    ).rejects.toThrow()
  })

  it('registers a second user with different email', async () => {
    const passwordHash = await hashPassword('bobpassword88')

    const [user] = await testDb.insert(schema.users).values({
      email: 'bob@example.com',
      passwordHash,
      name: 'Bob',
    }).returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
    })

    expect(user.email).toBe('bob@example.com')
    expect(user.name).toBe('Bob')
  })
})
