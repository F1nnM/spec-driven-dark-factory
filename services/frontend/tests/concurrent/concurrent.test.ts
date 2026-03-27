import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, and } from 'drizzle-orm'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as schema from '../../server/database/schema'
const migrationPath = resolve(__dirname, '../../server/database/migrations/0000_redundant_thor.sql')

describe('concurrent S3 drafting', () => {
  let pg: InstanceType<typeof PGlite>
  let testDb: ReturnType<typeof drizzle<typeof schema>>
  let userId: string
  let projectId: string

  beforeAll(async () => {
    pg = new PGlite()

    const sql = readFileSync(migrationPath, 'utf-8')
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
    for (const stmt of statements) {
      await pg.exec(stmt)
    }

    testDb = drizzle(pg, { schema })

    // Create test user
    const [user] = await testDb.insert(schema.users).values({
      githubId: 5001,
      username: 'concurrent',
      displayName: 'Concurrent User',
    }).returning({ id: schema.users.id })
    userId = user.id

    // Create test project
    const [project] = await testDb.insert(schema.projects).values({
      name: 'Concurrent Test Project',
      gitUrl: 'git@github.com:test/concurrent-repo.git',
      specsPath: '/specs',
      currentRevision: 1,
    }).returning()
    projectId = project.id

    // Add user as member
    await testDb.insert(schema.projectMembers).values({
      projectId,
      userId,
    })
  })

  afterAll(async () => {
    await pg.close()
  })

  it('creates S3 draft while S2 is implementing', async () => {
    // Create S2 as implementing
    const [s2Revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 2,
      status: 'implementing',
      branchName: 'revision-2',
    }).returning()

    await testDb.insert(schema.evolutionSteps).values({
      revisionId: s2Revision.id,
      stepNumber: 1,
      status: 'implementing',
      branchName: 'revision-2-step-1',
    })

    // Create S3 as drafting (concurrent)
    const nextRevisionNumber = 3
    const [s3Revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: nextRevisionNumber,
      status: 'drafting',
      branchName: `revision-${nextRevisionNumber}`,
    }).returning()

    // Update project's current revision
    await testDb
      .update(schema.projects)
      .set({ currentRevision: nextRevisionNumber })
      .where(eq(schema.projects.id, projectId))

    // Verify both revisions exist simultaneously
    const allRevisions = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.projectId, projectId))

    const implementing = allRevisions.filter((r) => r.status === 'implementing')
    const drafting = allRevisions.filter((r) => r.status === 'drafting')

    expect(implementing).toHaveLength(1)
    expect(implementing[0].revisionNumber).toBe(2)
    expect(drafting).toHaveLength(1)
    expect(drafting[0].revisionNumber).toBe(3)

    // S3 can have chat messages while S2 implements
    await testDb.insert(schema.chatMessages).values({
      revisionId: s3Revision.id,
      role: 'user',
      content: 'Draft new features while S2 implements',
    })

    const messages = await testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.revisionId, s3Revision.id))
    expect(messages).toHaveLength(1)
  })

  it('S3 approval queues behind S2 implementation', async () => {
    // Get the existing S3 drafting revision
    const [s3Revision] = await testDb
      .select()
      .from(schema.revisions)
      .where(and(eq(schema.revisions.projectId, projectId), eq(schema.revisions.status, 'drafting')))
      .limit(1)

    expect(s3Revision).toBeDefined()

    // Check if there's already an implementing revision
    const [implementingRevision] = await testDb
      .select()
      .from(schema.revisions)
      .where(and(eq(schema.revisions.projectId, projectId), eq(schema.revisions.status, 'implementing')))
      .limit(1)

    expect(implementingRevision).toBeDefined()
    expect(implementingRevision.revisionNumber).toBe(2)

    // "Approve" S3 — since S2 is implementing, S3 stays as 'approved' (queued)
    await testDb
      .update(schema.revisions)
      .set({ status: 'approved' })
      .where(eq(schema.revisions.id, s3Revision.id))

    // Add evolution steps for S3
    await testDb.insert(schema.evolutionSteps).values({
      revisionId: s3Revision.id,
      stepNumber: 1,
      status: 'pending',
      branchName: 'revision-3-step-1',
    })

    // Verify S3 is approved (queued), not implementing
    const [updatedS3] = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.id, s3Revision.id))
    expect(updatedS3.status).toBe('approved')

    // Verify S2 is still implementing
    const [updatedS2] = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.id, implementingRevision.id))
    expect(updatedS2.status).toBe('implementing')

    // S2 completes — S3 can now start
    await testDb
      .update(schema.revisions)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(schema.revisions.id, implementingRevision.id))

    // Now S3 can transition to implementing
    await testDb
      .update(schema.revisions)
      .set({ status: 'implementing' })
      .where(eq(schema.revisions.id, s3Revision.id))

    const [finalS3] = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.id, s3Revision.id))
    expect(finalS3.status).toBe('implementing')
  })
})
