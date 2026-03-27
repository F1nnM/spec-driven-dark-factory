import { eq, and, asc, desc } from 'drizzle-orm'
import type Anthropic from '@anthropic-ai/sdk'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody<{ message: string }>(event)
  if (!body.message || typeof body.message !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'message is required' })
  }

  // Verify membership
  const membership = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)))
    .limit(1)

  if (membership.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Get project details
  const [project] = await db
    .select({
      id: projects.id,
      specsPath: projects.specsPath,
      currentRevision: projects.currentRevision,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Get or create the current drafting revision
  // Allow concurrent drafting: a new draft can be created while another is implementing
  let [draftRevision] = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.projectId, projectId), eq(revisions.status, 'drafting')))
    .limit(1)

  if (!draftRevision) {
    const nextRevisionNumber = (project.currentRevision ?? 0) + 1
    const branchName = `revision-${nextRevisionNumber}`;

    [draftRevision] = await db
      .insert(revisions)
      .values({
        projectId,
        revisionNumber: nextRevisionNumber,
        status: 'drafting',
        branchName,
      })
      .returning()

    // Update project's current revision
    await db
      .update(projects)
      .set({ currentRevision: nextRevisionNumber })
      .where(eq(projects.id, projectId))
  }

  // Store user message
  await db.insert(chatMessages).values({
    revisionId: draftRevision.id,
    role: 'user',
    content: body.message,
  })

  // Load chat history for this revision to send as context
  const history = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
    })
    .from(chatMessages)
    .where(eq(chatMessages.revisionId, draftRevision.id))
    .orderBy(asc(chatMessages.createdAt))

  // Build Anthropic-format message history (exclude the latest user message, it goes as `message`)
  const pastMessages: Anthropic.Messages.MessageParam[] = history
    .slice(0, -1)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  // Call agent service
  const config = useRuntimeConfig()
  const agentUrl = config.agentUrl

  const agentResponse = await $fetch<{
    response: string
    specs: any[]
    updatedHistory: Anthropic.Messages.MessageParam[]
  }>(`${agentUrl}/api/projects/${projectId}/draft`, {
    method: 'POST',
    body: {
      message: body.message,
      revisionNumber: draftRevision.revisionNumber,
      specsPath: project.specsPath,
      messages: pastMessages,
    },
  })

  // Store AI response
  await db.insert(chatMessages).values({
    revisionId: draftRevision.id,
    role: 'assistant',
    content: agentResponse.response,
  })

  return {
    response: agentResponse.response,
    specs: agentResponse.specs,
    revisionNumber: draftRevision.revisionNumber,
  }
})
