import { eq, and, inArray, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
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

  // Get current active revision (drafting, approved, or implementing)
  const [revision] = await db
    .select()
    .from(revisions)
    .where(
      and(
        eq(revisions.projectId, projectId),
        inArray(revisions.status, ['drafting', 'approved', 'implementing']),
      ),
    )
    .limit(1)

  if (!revision) {
    return { revision: null, steps: [] }
  }

  // Get evolution steps for this revision
  const steps = await db
    .select()
    .from(evolutionSteps)
    .where(eq(evolutionSteps.revisionId, revision.id))
    .orderBy(asc(evolutionSteps.stepNumber))

  return {
    revision: {
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      status: revision.status,
      branchName: revision.branchName,
      createdAt: revision.createdAt,
      completedAt: revision.completedAt,
    },
    steps: steps.map((s) => ({
      id: s.id,
      stepNumber: s.stepNumber,
      status: s.status,
      branchName: s.branchName,
      reviewLoopCount: s.reviewLoopCount,
      reviewSummary: s.reviewSummary,
    })),
  }
})
