import { eq, and, asc } from 'drizzle-orm'
import { createError, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody<{
    action: 'keep_partial' | 'rollback' | 'discard'
    keepStepNumber?: number
  }>(event)

  if (!body.action || !['keep_partial', 'rollback', 'discard'].includes(body.action)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid action is required: keep_partial, rollback, or discard' })
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

  // Get the implementing revision
  const [implementingRevision] = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.projectId, projectId), eq(revisions.status, 'implementing')))
    .limit(1)

  if (!implementingRevision) {
    throw createError({ statusCode: 400, statusMessage: 'No implementing revision found' })
  }

  // Call agent to stop the pipeline
  const config = useRuntimeConfig()
  const agentUrl = config.agentUrl

  try {
    await $fetch(`${agentUrl}/api/projects/${projectId}/interrupt`, {
      method: 'POST',
    })
  } catch {
    // Pipeline might already be stopped, continue with the action
  }

  // Get evolution steps
  const steps = await db
    .select()
    .from(evolutionSteps)
    .where(eq(evolutionSteps.revisionId, implementingRevision.id))
    .orderBy(asc(evolutionSteps.stepNumber))

  if (body.action === 'keep_partial') {
    const keepUpTo = body.keepStepNumber ?? steps.filter((s) => s.status === 'completed').length

    // Mark completed steps up to keepStepNumber
    const completedSteps = steps.filter((s) => s.status === 'completed' && s.stepNumber <= keepUpTo)
    const remainingSteps = steps.filter((s) => s.stepNumber > keepUpTo)

    // Update the implementing revision to completed with partial work
    await db
      .update(revisions)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(revisions.id, implementingRevision.id))

    // Mark remaining steps as failed
    for (const step of remainingSteps) {
      await db
        .update(evolutionSteps)
        .set({ status: 'failed' })
        .where(eq(evolutionSteps.id, step.id))
    }

    // Create a new drafting revision for the remaining work
    const nextRevisionNumber = implementingRevision.revisionNumber + 1
    await db.insert(revisions).values({
      projectId,
      revisionNumber: nextRevisionNumber,
      status: 'drafting',
      branchName: `revision-${nextRevisionNumber}`,
    })

    await db
      .update(projects)
      .set({ currentRevision: nextRevisionNumber })
      .where(eq(projects.id, projectId))

    return {
      action: 'keep_partial',
      completedSteps: completedSteps.length,
      remainingSteps: remainingSteps.length,
      newRevisionNumber: nextRevisionNumber,
    }
  }

  if (body.action === 'rollback') {
    // Reset revision to drafting state
    await db
      .update(revisions)
      .set({ status: 'drafting' })
      .where(eq(revisions.id, implementingRevision.id))

    // Reset all steps to pending
    for (const step of steps) {
      await db
        .update(evolutionSteps)
        .set({ status: 'pending', reviewLoopCount: 0, reviewSummary: null })
        .where(eq(evolutionSteps.id, step.id))
    }

    // Delete evolution steps so they can be re-planned
    for (const step of steps) {
      await db.delete(evolutionSteps).where(eq(evolutionSteps.id, step.id))
    }

    return {
      action: 'rollback',
      revisionNumber: implementingRevision.revisionNumber,
      status: 'drafting',
    }
  }

  if (body.action === 'discard') {
    // Delete the revision entirely (cascade deletes steps and messages)
    await db.delete(revisions).where(eq(revisions.id, implementingRevision.id))

    // Decrement project's current revision
    const prevRevisionNumber = Math.max(0, implementingRevision.revisionNumber - 1)
    await db
      .update(projects)
      .set({ currentRevision: prevRevisionNumber })
      .where(eq(projects.id, projectId))

    return {
      action: 'discard',
      discardedRevisionNumber: implementingRevision.revisionNumber,
    }
  }
})
