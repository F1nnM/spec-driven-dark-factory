import { eq, and } from 'drizzle-orm'
import { createError } from 'h3'
import { projects, projectMembers } from '../../../database/schema'
import { requireAuth } from '../../../utils/auth'
import { db } from '../../../utils/db'

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

  const [project] = await db
    .select({
      id: projects.id,
      specsPath: projects.specsPath,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const query = getQuery(event)
  const branch = (query.branch as string) ?? 'main'

  const config = useRuntimeConfig()
  const agentUrl = config.agentUrl

  const response = await $fetch<{ specs: any[]; index: any }>(
    `${agentUrl}/api/projects/${projectId}/specs`,
    {
      query: {
        branch,
        specsPath: project.specsPath,
      },
    },
  )

  return response
})
