import { eq, and, asc } from 'drizzle-orm'
import { createError } from 'h3'
import {
  projectMembers,
  revisions,
  chatMessages,
} from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  // Verify membership
  const membership = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1)

  if (membership.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Find the current drafting revision
  const [draftRevision] = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.projectId, projectId), eq(revisions.status, 'drafting')))
    .limit(1)

  if (!draftRevision) {
    return { messages: [], revisionNumber: null }
  }

  // Load messages for this revision
  const messages = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.revisionId, draftRevision.id))
    .orderBy(asc(chatMessages.createdAt))

  return {
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    revisionNumber: draftRevision.revisionNumber,
  }
})
