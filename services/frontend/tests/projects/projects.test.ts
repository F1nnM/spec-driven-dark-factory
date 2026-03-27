import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, and } from 'drizzle-orm'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as schema from '../../server/database/schema'
import { encrypt, decrypt } from '../../server/utils/crypto'

const migrationPath = resolve(__dirname, '../../server/database/migrations/0000_overconfident_black_queen.sql')

// 32-byte hex key for testing
const TEST_ENCRYPTION_KEY = 'a'.repeat(64)

describe('project management database operations', () => {
  let pg: InstanceType<typeof PGlite>
  let testDb: ReturnType<typeof drizzle<typeof schema>>
  let aliceId: string
  let bobId: string
  let projectId: string

  beforeAll(async () => {
    pg = new PGlite()

    const sql = readFileSync(migrationPath, 'utf-8')
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
    for (const stmt of statements) {
      await pg.exec(stmt)
    }

    testDb = drizzle(pg, { schema })

    // Create test users
    const [alice] = await testDb.insert(schema.users).values({
      githubId: 1001,
      username: 'alice',
      displayName: 'Alice',
    }).returning({ id: schema.users.id })
    aliceId = alice.id

    const [bob] = await testDb.insert(schema.users).values({
      githubId: 1002,
      username: 'bob',
      displayName: 'Bob',
    }).returning({ id: schema.users.id })
    bobId = bob.id
  })

  afterAll(async () => {
    await pg.close()
  })

  it('creates a project with encrypted SSH key', async () => {
    const sshKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nfake-key-data\n-----END OPENSSH PRIVATE KEY-----'
    const encryptedKey = encrypt(sshKey, TEST_ENCRYPTION_KEY)

    const [project] = await testDb.insert(schema.projects).values({
      name: 'Test Project',
      gitUrl: 'git@github.com:test/repo.git',
      sshPrivateKeyEncrypted: encryptedKey,
      specsPath: '/specs',
    }).returning()

    projectId = project.id

    expect(project.name).toBe('Test Project')
    expect(project.gitUrl).toBe('git@github.com:test/repo.git')
    expect(project.sshPrivateKeyEncrypted).not.toContain('PRIVATE KEY')

    // Verify we can decrypt
    const decrypted = decrypt(project.sshPrivateKeyEncrypted!, TEST_ENCRYPTION_KEY)
    expect(decrypted).toBe(sshKey)
  })

  it('adds creator as a project member', async () => {
    await testDb.insert(schema.projectMembers).values({
      projectId,
      userId: aliceId,
    })

    const members = await testDb
      .select()
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.projectId, projectId))

    expect(members).toHaveLength(1)
    expect(members[0].userId).toBe(aliceId)
  })

  it('lists only projects the user is a member of', async () => {
    // Create another project that alice is NOT a member of
    const [otherProject] = await testDb.insert(schema.projects).values({
      name: 'Other Project',
      gitUrl: 'git@github.com:other/repo.git',
    }).returning()

    // Add bob as member of the other project
    await testDb.insert(schema.projectMembers).values({
      projectId: otherProject.id,
      userId: bobId,
    })

    // Query projects for alice
    const aliceProjects = await testDb
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .innerJoin(schema.projectMembers, eq(schema.projects.id, schema.projectMembers.projectId))
      .where(eq(schema.projectMembers.userId, aliceId))

    expect(aliceProjects).toHaveLength(1)
    expect(aliceProjects[0].name).toBe('Test Project')

    // Query projects for bob
    const bobProjects = await testDb
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .innerJoin(schema.projectMembers, eq(schema.projects.id, schema.projectMembers.projectId))
      .where(eq(schema.projectMembers.userId, bobId))

    expect(bobProjects).toHaveLength(1)
    expect(bobProjects[0].name).toBe('Other Project')
  })

  it('adds a member to a project', async () => {
    await testDb.insert(schema.projectMembers).values({
      projectId,
      userId: bobId,
    })

    const members = await testDb
      .select()
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.projectId, projectId))

    expect(members).toHaveLength(2)
    const userIds = members.map(m => m.userId)
    expect(userIds).toContain(aliceId)
    expect(userIds).toContain(bobId)
  })

  it('removes a member from a project', async () => {
    const deleted = await testDb
      .delete(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, bobId),
        ),
      )
      .returning()

    expect(deleted).toHaveLength(1)

    const members = await testDb
      .select()
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.projectId, projectId))

    expect(members).toHaveLength(1)
    expect(members[0].userId).toBe(aliceId)
  })

  it('prevents duplicate membership', async () => {
    await expect(
      testDb.insert(schema.projectMembers).values({
        projectId,
        userId: aliceId,
      }).execute(),
    ).rejects.toThrow()
  })

  it('cascades project deletion to members', async () => {
    // Create a temporary project with a member
    const [tempProject] = await testDb.insert(schema.projects).values({
      name: 'Temp Project',
      gitUrl: 'git@github.com:temp/repo.git',
    }).returning()

    await testDb.insert(schema.projectMembers).values({
      projectId: tempProject.id,
      userId: aliceId,
    })

    // Delete the project
    await testDb.delete(schema.projects).where(eq(schema.projects.id, tempProject.id))

    // Verify members are gone
    const members = await testDb
      .select()
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.projectId, tempProject.id))

    expect(members).toHaveLength(0)
  })
})
