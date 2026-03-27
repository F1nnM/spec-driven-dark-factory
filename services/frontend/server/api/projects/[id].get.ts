import { eq, and, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
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

  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      gitUrl: projects.gitUrl,
      specsPath: projects.specsPath,
      currentRevision: projects.currentRevision,
      createdAt: projects.createdAt,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM project_members WHERE project_id = ${projects.id}
      )`,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  return { project }
})
