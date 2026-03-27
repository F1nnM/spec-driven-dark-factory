import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, asc } from 'drizzle-orm'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as schema from '../../server/database/schema'
import { hashPassword } from '../../server/utils/password'

const migrationPath = resolve(__dirname, '../../server/database/migrations/0000_mushy_edwin_jarvis.sql')

describe('revision approval and evolution steps', () => {
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
    const passwordHash = await hashPassword('testpassword')
    const [user] = await testDb.insert(schema.users).values({
      email: 'reviewer@test.com',
      passwordHash,
      name: 'Reviewer',
    }).returning({ id: schema.users.id })
    userId = user.id

    // Create test project
    const [project] = await testDb.insert(schema.projects).values({
      name: 'Review Test Project',
      gitUrl: 'git@github.com:test/review-repo.git',
      specsPath: '/specs',
      currentRevision: 0,
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

  it('transitions revision from drafting to approved', async () => {
    // Create a drafting revision
    const [revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 1,
      status: 'drafting',
      branchName: 'revision-1',
    }).returning()

    expect(revision.status).toBe('drafting')

    // Transition to approved
    const [updated] = await testDb
      .update(schema.revisions)
      .set({ status: 'approved' })
      .where(eq(schema.revisions.id, revision.id))
      .returning()

    expect(updated.status).toBe('approved')
  })

  it('transitions revision from approved to implementing', async () => {
    // Get the revision
    const [revision] = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.projectId, projectId))
      .limit(1)

    // Transition to implementing
    const [updated] = await testDb
      .update(schema.revisions)
      .set({ status: 'implementing' })
      .where(eq(schema.revisions.id, revision.id))
      .returning()

    expect(updated.status).toBe('implementing')
  })

  it('stores evolution steps for a revision', async () => {
    const [revision] = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.projectId, projectId))
      .limit(1)

    // Insert evolution steps
    await testDb.insert(schema.evolutionSteps).values([
      {
        revisionId: revision.id,
        stepNumber: 1,
        status: 'pending',
        branchName: 'revision-1-step-1',
      },
      {
        revisionId: revision.id,
        stepNumber: 2,
        status: 'pending',
        branchName: 'revision-1-step-2',
      },
      {
        revisionId: revision.id,
        stepNumber: 3,
        status: 'pending',
        branchName: 'revision-1-step-3',
      },
    ])

    const steps = await testDb
      .select()
      .from(schema.evolutionSteps)
      .where(eq(schema.evolutionSteps.revisionId, revision.id))
      .orderBy(asc(schema.evolutionSteps.stepNumber))

    expect(steps).toHaveLength(3)
    expect(steps[0].stepNumber).toBe(1)
    expect(steps[0].status).toBe('pending')
    expect(steps[0].branchName).toBe('revision-1-step-1')
    expect(steps[1].stepNumber).toBe(2)
    expect(steps[2].stepNumber).toBe(3)
  })

  it('updates step status and tracks review loops', async () => {
    const [revision] = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.projectId, projectId))
      .limit(1)

    const steps = await testDb
      .select()
      .from(schema.evolutionSteps)
      .where(eq(schema.evolutionSteps.revisionId, revision.id))
      .orderBy(asc(schema.evolutionSteps.stepNumber))

    // Transition step 1 to implementing
    const [step1] = await testDb
      .update(schema.evolutionSteps)
      .set({ status: 'implementing' })
      .where(eq(schema.evolutionSteps.id, steps[0].id))
      .returning()

    expect(step1.status).toBe('implementing')

    // Transition step 1 to reviewing with review info
    const [step1Reviewing] = await testDb
      .update(schema.evolutionSteps)
      .set({
        status: 'reviewing',
        reviewLoopCount: 1,
        reviewSummary: 'Tests passing, checking code quality',
      })
      .where(eq(schema.evolutionSteps.id, steps[0].id))
      .returning()

    expect(step1Reviewing.status).toBe('reviewing')
    expect(step1Reviewing.reviewLoopCount).toBe(1)
    expect(step1Reviewing.reviewSummary).toBe('Tests passing, checking code quality')

    // Complete step 1
    const [step1Completed] = await testDb
      .update(schema.evolutionSteps)
      .set({ status: 'completed' })
      .where(eq(schema.evolutionSteps.id, steps[0].id))
      .returning()

    expect(step1Completed.status).toBe('completed')
  })

  it('cascade deletes evolution steps when revision is deleted', async () => {
    // Create a new revision with steps
    const [revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 2,
      status: 'implementing',
      branchName: 'revision-2',
    }).returning()

    await testDb.insert(schema.evolutionSteps).values({
      revisionId: revision.id,
      stepNumber: 1,
      status: 'pending',
      branchName: 'revision-2-step-1',
    })

    // Verify step exists
    const before = await testDb
      .select()
      .from(schema.evolutionSteps)
      .where(eq(schema.evolutionSteps.revisionId, revision.id))
    expect(before).toHaveLength(1)

    // Delete the revision
    await testDb.delete(schema.revisions).where(eq(schema.revisions.id, revision.id))

    // Verify steps are cascade deleted
    const after = await testDb
      .select()
      .from(schema.evolutionSteps)
      .where(eq(schema.evolutionSteps.revisionId, revision.id))
    expect(after).toHaveLength(0)
  })

  it('completes full lifecycle: drafting -> approved -> implementing -> completed', async () => {
    // Create a fresh revision
    const [revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 3,
      status: 'drafting',
      branchName: 'revision-3',
    }).returning()

    expect(revision.status).toBe('drafting')

    // Approve
    const [approved] = await testDb
      .update(schema.revisions)
      .set({ status: 'approved' })
      .where(eq(schema.revisions.id, revision.id))
      .returning()
    expect(approved.status).toBe('approved')

    // Start implementing
    const [implementing] = await testDb
      .update(schema.revisions)
      .set({ status: 'implementing' })
      .where(eq(schema.revisions.id, revision.id))
      .returning()
    expect(implementing.status).toBe('implementing')

    // Add and complete a step
    await testDb.insert(schema.evolutionSteps).values({
      revisionId: revision.id,
      stepNumber: 1,
      status: 'completed',
      branchName: 'revision-3-step-1',
    })

    // Complete the revision
    const now = new Date()
    const [completed] = await testDb
      .update(schema.revisions)
      .set({ status: 'completed', completedAt: now })
      .where(eq(schema.revisions.id, revision.id))
      .returning()

    expect(completed.status).toBe('completed')
    expect(completed.completedAt).toBeTruthy()
  })
})
