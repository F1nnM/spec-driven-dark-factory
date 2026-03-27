import { eq, and } from 'drizzle-orm'
import { createError } from 'h3'
import {
  projects,
  projectMembers,
  revisions,
  evolutionSteps,
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

  // Get current drafting revision
  const [draftRevision] = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.projectId, projectId), eq(revisions.status, 'drafting')))
    .limit(1)

  if (!draftRevision) {
    throw createError({ statusCode: 400, statusMessage: 'No drafting revision found' })
  }

  // Check if another revision is already implementing (concurrent drafting support)
  const [implementingRevision] = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.projectId, projectId), eq(revisions.status, 'implementing')))
    .limit(1)

  // Update status to approved
  await db
    .update(revisions)
    .set({ status: 'approved' })
    .where(eq(revisions.id, draftRevision.id))

  // Call agent to plan implementation
  const config = useRuntimeConfig()
  const agentUrl = config.agentUrl

  const agentResponse = await $fetch<{ steps: { stepNumber: number; branchName: string }[] }>(
    `${agentUrl}/api/projects/${projectId}/approve`,
    {
      method: 'POST',
      body: {
        revisionNumber: draftRevision.revisionNumber,
        specsPath: project.specsPath,
      },
    },
  )

  // Store evolution steps
  if (agentResponse.steps && agentResponse.steps.length > 0) {
    await db.insert(evolutionSteps).values(
      agentResponse.steps.map((step) => ({
        revisionId: draftRevision.id,
        stepNumber: step.stepNumber,
        status: 'pending' as const,
        branchName: step.branchName,
      })),
    )
  }

  if (implementingRevision) {
    // Another revision is implementing — keep this one as 'approved' (queued)
    // It will start implementing when the current one finishes
    return {
      revisionNumber: draftRevision.revisionNumber,
      steps: agentResponse.steps,
      queued: true,
    }
  }

  // No other revision implementing — start this one
  await db
    .update(revisions)
    .set({ status: 'implementing' })
    .where(eq(revisions.id, draftRevision.id))

  return {
    revisionNumber: draftRevision.revisionNumber,
    steps: agentResponse.steps,
    queued: false,
  }
})
