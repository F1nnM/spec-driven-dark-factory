import { eq, and } from 'drizzle-orm'
import { createError, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody<{
    action: 'evaluate' | 'execute'
    branch?: string
  }>(event)

  if (!body.action || !['evaluate', 'execute'].includes(body.action)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid action is required: evaluate or execute' })
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
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  const config = useRuntimeConfig()
  const agentUrl = config.agentUrl
  const branch = body.branch ?? 'main'

  if (body.action === 'evaluate') {
    const result = await $fetch<{ score: number; reasoning: string }>(
      `${agentUrl}/api/projects/${projectId}/restructure/evaluate`,
      {
        method: 'POST',
        body: {
          branch,
          specsPath: project.specsPath,
        },
      },
    )

    return result
  }

  if (body.action === 'execute') {
    const result = await $fetch<{ summary: string }>(
      `${agentUrl}/api/projects/${projectId}/restructure/execute`,
      {
        method: 'POST',
        body: {
          branch,
          specsPath: project.specsPath,
        },
      },
    )

    return result
  }
})
