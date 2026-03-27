import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, asc } from 'drizzle-orm'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as schema from '../../server/database/schema'
const migrationPath = resolve(__dirname, '../../server/database/migrations/0000_overconfident_black_queen.sql')

describe('interruption handling', () => {
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
      githubId: 4001,
      username: 'interrupter',
      displayName: 'Interrupter',
    }).returning({ id: schema.users.id })
    userId = user.id

    // Create test project
    const [project] = await testDb.insert(schema.projects).values({
      name: 'Interrupt Test Project',
      gitUrl: 'git@github.com:test/interrupt-repo.git',
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

  it('keep_partial: updates revision to completed and creates new draft for remaining work', async () => {
    // Create implementing revision with steps
    const [revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 1,
      status: 'implementing',
      branchName: 'revision-1',
    }).returning()

    await testDb.insert(schema.evolutionSteps).values([
      {
        revisionId: revision.id,
        stepNumber: 1,
        status: 'completed',
        branchName: 'revision-1-step-1',
      },
      {
        revisionId: revision.id,
        stepNumber: 2,
        status: 'completed',
        branchName: 'revision-1-step-2',
      },
      {
        revisionId: revision.id,
        stepNumber: 3,
        status: 'implementing',
        branchName: 'revision-1-step-3',
      },
    ])

    // Simulate keep_partial action (keepStepNumber = 2)
    const keepUpTo = 2

    // Mark remaining steps as failed
    const steps = await testDb
      .select()
      .from(schema.evolutionSteps)
      .where(eq(schema.evolutionSteps.revisionId, revision.id))
      .orderBy(asc(schema.evolutionSteps.stepNumber))

    const remainingSteps = steps.filter((s) => s.stepNumber > keepUpTo)
    for (const step of remainingSteps) {
      await testDb
        .update(schema.evolutionSteps)
        .set({ status: 'failed' })
        .where(eq(schema.evolutionSteps.id, step.id))
    }

    // Complete the revision with partial work
    await testDb
      .update(schema.revisions)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(schema.revisions.id, revision.id))

    // Verify revision is completed
    const [updatedRevision] = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.id, revision.id))
    expect(updatedRevision.status).toBe('completed')
    expect(updatedRevision.completedAt).toBeTruthy()

    // Verify step 3 is failed
    const updatedSteps = await testDb
      .select()
      .from(schema.evolutionSteps)
      .where(eq(schema.evolutionSteps.revisionId, revision.id))
      .orderBy(asc(schema.evolutionSteps.stepNumber))

    expect(updatedSteps[0].status).toBe('completed')
    expect(updatedSteps[1].status).toBe('completed')
    expect(updatedSteps[2].status).toBe('failed')

    // Create new draft revision for remaining work
    const nextRevisionNumber = revision.revisionNumber + 1
    const [newRevision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: nextRevisionNumber,
      status: 'drafting',
      branchName: `revision-${nextRevisionNumber}`,
    }).returning()

    expect(newRevision.status).toBe('drafting')
    expect(newRevision.revisionNumber).toBe(2)
  })

  it('rollback: resets revision to drafting state', async () => {
    // Create implementing revision
    const [revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 3,
      status: 'implementing',
      branchName: 'revision-3',
    }).returning()

    await testDb.insert(schema.evolutionSteps).values([
      {
        revisionId: revision.id,
        stepNumber: 1,
        status: 'completed',
        branchName: 'revision-3-step-1',
      },
      {
        revisionId: revision.id,
        stepNumber: 2,
        status: 'implementing',
        branchName: 'revision-3-step-2',
      },
    ])

    // Rollback: reset to drafting
    await testDb
      .update(schema.revisions)
      .set({ status: 'drafting' })
      .where(eq(schema.revisions.id, revision.id))

    // Delete evolution steps
    const steps = await testDb
      .select()
      .from(schema.evolutionSteps)
      .where(eq(schema.evolutionSteps.revisionId, revision.id))

    for (const step of steps) {
      await testDb.delete(schema.evolutionSteps).where(eq(schema.evolutionSteps.id, step.id))
    }

    // Verify revision is back to drafting
    const [updatedRevision] = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.id, revision.id))
    expect(updatedRevision.status).toBe('drafting')

    // Verify no steps remain
    const remainingSteps = await testDb
      .select()
      .from(schema.evolutionSteps)
      .where(eq(schema.evolutionSteps.revisionId, revision.id))
    expect(remainingSteps).toHaveLength(0)
  })

  it('discard: removes the revision entirely', async () => {
    // Create implementing revision
    const [revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 4,
      status: 'implementing',
      branchName: 'revision-4',
    }).returning()

    await testDb.insert(schema.evolutionSteps).values({
      revisionId: revision.id,
      stepNumber: 1,
      status: 'implementing',
      branchName: 'revision-4-step-1',
    })

    await testDb.insert(schema.chatMessages).values({
      revisionId: revision.id,
      role: 'user',
      content: 'Add a new spec',
    })

    // Discard: delete the revision (cascade deletes steps and messages)
    await testDb.delete(schema.revisions).where(eq(schema.revisions.id, revision.id))

    // Verify revision is gone
    const remainingRevisions = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.id, revision.id))
    expect(remainingRevisions).toHaveLength(0)

    // Verify steps are gone (cascade)
    const remainingSteps = await testDb
      .select()
      .from(schema.evolutionSteps)
      .where(eq(schema.evolutionSteps.revisionId, revision.id))
    expect(remainingSteps).toHaveLength(0)

    // Verify messages are gone (cascade)
    const remainingMessages = await testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.revisionId, revision.id))
    expect(remainingMessages).toHaveLength(0)

    // Decrement project revision
    await testDb
      .update(schema.projects)
      .set({ currentRevision: 3 })
      .where(eq(schema.projects.id, projectId))

    const [project] = await testDb
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
    expect(project.currentRevision).toBe(3)
  })
})
