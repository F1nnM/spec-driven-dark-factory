import { eq, and } from 'drizzle-orm'
import { createError, readBody } from 'h3'
import { users, projectMembers } from '../../../database/schema'
import { requireAuth } from '../../../utils/auth'
import { db } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  // Verify caller is a member
  const membership = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1)

  if (membership.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const body = await readBody(event)
  const email = body?.email?.trim()?.toLowerCase()

  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'Email is required' })
  }

  // Find user by email
  const [targetUser] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!targetUser) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Check if already a member
  const existing = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, targetUser.id)))
    .limit(1)

  if (existing.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'User is already a member' })
  }

  await db.insert(projectMembers).values({
    projectId,
    userId: targetUser.id,
  })

  return { member: targetUser }
})
