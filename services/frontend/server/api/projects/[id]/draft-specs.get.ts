import { eq, and } from 'drizzle-orm'

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

  // Find the current drafting revision
  const [draftRevision] = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.projectId, projectId), eq(revisions.status, 'drafting')))
    .limit(1)

  if (!draftRevision) {
    return { specs: [], mainSpecs: [], revisionNumber: null }
  }

  const config = useRuntimeConfig()
  const agentUrl = config.agentUrl
  const branchName = `revision-${draftRevision.revisionNumber}`

  // Fetch draft specs from the revision branch and main specs in parallel
  const [draftResponse, mainResponse] = await Promise.all([
    $fetch<{ specs: any[]; index: any }>(
      `${agentUrl}/api/projects/${projectId}/specs`,
      {
        query: {
          branch: branchName,
          specsPath: project.specsPath,
        },
      },
    ).catch(() => ({ specs: [], index: {} })),
    $fetch<{ specs: any[]; index: any }>(
      `${agentUrl}/api/projects/${projectId}/specs`,
      {
        query: {
          branch: 'main',
          specsPath: project.specsPath,
        },
      },
    ).catch(() => ({ specs: [], index: {} })),
  ])

  return {
    specs: draftResponse.specs,
    mainSpecs: mainResponse.specs,
    revisionNumber: draftRevision.revisionNumber,
  }
})
