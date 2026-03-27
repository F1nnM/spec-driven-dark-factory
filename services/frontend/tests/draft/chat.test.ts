import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, asc } from 'drizzle-orm'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import * as schema from '../../server/database/schema'
const migrationPath = resolve(__dirname, '../../server/database/migrations/0000_redundant_thor.sql')

describe('chat messages and revision management', () => {
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
      githubId: 2001,
      username: 'drafter',
      displayName: 'Drafter',
    }).returning({ id: schema.users.id })
    userId = user.id

    // Create test project
    const [project] = await testDb.insert(schema.projects).values({
      name: 'Draft Test Project',
      gitUrl: 'git@github.com:test/draft-repo.git',
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

  it('creates a revision with status drafting', async () => {
    const [revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 1,
      status: 'drafting',
      branchName: 'revision-1',
    }).returning()

    expect(revision.projectId).toBe(projectId)
    expect(revision.revisionNumber).toBe(1)
    expect(revision.status).toBe('drafting')
    expect(revision.branchName).toBe('revision-1')
    expect(revision.id).toBeDefined()
  })

  it('stores and retrieves chat messages', async () => {
    // Get the revision we just created
    const [revision] = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.projectId, projectId))
      .limit(1)

    // Insert user message
    await testDb.insert(schema.chatMessages).values({
      revisionId: revision.id,
      role: 'user',
      content: 'Add an authentication spec',
    })

    // Insert assistant response
    await testDb.insert(schema.chatMessages).values({
      revisionId: revision.id,
      role: 'assistant',
      content: 'I have created SPEC-001 for user authentication with OAuth 2.0.',
    })

    // Retrieve messages
    const messages = await testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.revisionId, revision.id))
      .orderBy(asc(schema.chatMessages.createdAt))

    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('Add an authentication spec')
    expect(messages[1].role).toBe('assistant')
    expect(messages[1].content).toBe('I have created SPEC-001 for user authentication with OAuth 2.0.')
  })

  it('creates a revision on first message when none exists', async () => {
    // Create a second project with no revisions
    const [project2] = await testDb.insert(schema.projects).values({
      name: 'No Revision Project',
      gitUrl: 'git@github.com:test/no-rev.git',
      specsPath: '/specs',
      currentRevision: 0,
    }).returning()

    // Verify no revisions exist
    const existingRevisions = await testDb
      .select()
      .from(schema.revisions)
      .where(eq(schema.revisions.projectId, project2.id))

    expect(existingRevisions).toHaveLength(0)

    // Simulate what the chat.post endpoint does: create a revision if none exists
    const nextRevisionNumber = (project2.currentRevision ?? 0) + 1
    const [newRevision] = await testDb.insert(schema.revisions).values({
      projectId: project2.id,
      revisionNumber: nextRevisionNumber,
      status: 'drafting',
      branchName: `revision-${nextRevisionNumber}`,
    }).returning()

    // Update project
    await testDb
      .update(schema.projects)
      .set({ currentRevision: nextRevisionNumber })
      .where(eq(schema.projects.id, project2.id))

    expect(newRevision.revisionNumber).toBe(1)
    expect(newRevision.status).toBe('drafting')

    // Now store a message
    await testDb.insert(schema.chatMessages).values({
      revisionId: newRevision.id,
      role: 'user',
      content: 'First message for this project',
    })

    const messages = await testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.revisionId, newRevision.id))

    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('First message for this project')
  })

  it('messages are ordered by createdAt', async () => {
    // Create a fresh revision for ordering test
    const [revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 2,
      status: 'drafting',
      branchName: 'revision-2',
    }).returning()

    // Insert messages (PGlite defaults should give sequential timestamps)
    const contents = [
      { role: 'user' as const, content: 'First message' },
      { role: 'assistant' as const, content: 'First response' },
      { role: 'user' as const, content: 'Second message' },
      { role: 'assistant' as const, content: 'Second response' },
    ]

    for (const msg of contents) {
      await testDb.insert(schema.chatMessages).values({
        revisionId: revision.id,
        role: msg.role,
        content: msg.content,
      })
    }

    const messages = await testDb
      .select({
        role: schema.chatMessages.role,
        content: schema.chatMessages.content,
        createdAt: schema.chatMessages.createdAt,
      })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.revisionId, revision.id))
      .orderBy(asc(schema.chatMessages.createdAt))

    expect(messages).toHaveLength(4)
    expect(messages[0].content).toBe('First message')
    expect(messages[1].content).toBe('First response')
    expect(messages[2].content).toBe('Second message')
    expect(messages[3].content).toBe('Second response')

    // Verify chronological order
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].createdAt.getTime()).toBeGreaterThanOrEqual(messages[i - 1].createdAt.getTime())
    }
  })

  it('cascade deletes messages when revision is deleted', async () => {
    // Create a revision with messages
    const [revision] = await testDb.insert(schema.revisions).values({
      projectId,
      revisionNumber: 3,
      status: 'drafting',
      branchName: 'revision-3',
    }).returning()

    await testDb.insert(schema.chatMessages).values({
      revisionId: revision.id,
      role: 'user',
      content: 'This will be deleted',
    })

    // Verify message exists
    const before = await testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.revisionId, revision.id))
    expect(before).toHaveLength(1)

    // Delete the revision
    await testDb.delete(schema.revisions).where(eq(schema.revisions.id, revision.id))

    // Verify messages are cascade deleted
    const after = await testDb
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.revisionId, revision.id))
    expect(after).toHaveLength(0)
  })
})
