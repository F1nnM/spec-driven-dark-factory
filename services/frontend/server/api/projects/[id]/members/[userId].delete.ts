import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const caller = await requireAuth(event)
  const projectId = getRouterParam(event, 'id')
  const targetUserId = getRouterParam(event, 'userId')

  if (!projectId || !targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID and User ID are required' })
  }

  // Verify caller is a member
  const membership = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, caller.id)))
    .limit(1)

  if (membership.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Delete the target member
  const deleted = await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetUserId)))
    .returning()

  if (deleted.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  return { ok: true }
})
