import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runPipeline, type PipelineStep } from '../agents/pipeline-runner.js'
import { execGit } from '../git/operations.js'
import { updateStepStatus, updateRevisionStatus } from '../utils/status-updater.js'

const REPOS_BASE = process.env.REPOS_PATH ?? '/tmp/spec-factory-repos'
const HASURA_ENDPOINT = process.env.HASURA_ENDPOINT ?? 'http://hasura:8080/v1/graphql'
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET ?? ''

function repoPath(projectId: string): string {
  return join(REPOS_BASE, projectId)
}

export async function handleImplement(
  req: Request,
  projectId: string,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      revisionNumber: number
      revisionId?: string
      steps: (PipelineStep & { id?: string })[]
      specsPath?: string
    }

    if (body.revisionNumber == null) {
      return Response.json(
        { error: 'revisionNumber is required' },
        { status: 400 },
      )
    }

    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return Response.json(
        { error: 'steps array is required and must not be empty' },
        { status: 400 },
      )
    }

    const repoDir = repoPath(projectId)
    if (!existsSync(repoDir)) {
      return Response.json({ error: 'Repository not found' }, { status: 404 })
    }

    const specsPath = body.specsPath ?? 'specs'
    const revisionBranch = `revision-${body.revisionNumber}`

    // Verify revision branch exists
    try {
      await execGit(repoDir, ['rev-parse', '--verify', revisionBranch])
    } catch {
      return Response.json(
        { error: `Branch ${revisionBranch} not found` },
        { status: 404 },
      )
    }

    // Build a map of stepNumber -> stepId for status updates
    const stepIdMap = new Map<number, string>()
    for (const step of body.steps) {
      if (step.id) {
        stepIdMap.set(step.stepNumber, step.id)
      }
    }

    // Start pipeline asynchronously
    runPipeline(
      projectId,
      repoDir,
      body.revisionNumber,
      body.steps,
      specsPath,
      async (stepResult) => {
        console.log(
          `[pipeline] Project ${projectId} revision ${body.revisionNumber} step ${stepResult.stepNumber}: ${stepResult.status}`,
        )

        // Update step status in database via Hasura
        const stepId = stepIdMap.get(stepResult.stepNumber)
        if (stepId && HASURA_ADMIN_SECRET) {
          try {
            await updateStepStatus(
              HASURA_ENDPOINT,
              HASURA_ADMIN_SECRET,
              stepId,
              stepResult.status,
              stepResult.reviewLoopCount,
              stepResult.reviewSummary ?? undefined,
            )
          } catch (err) {
            console.error(`[pipeline] Failed to update step status:`, err)
          }
        }
      },
    ).then(async (pipelineResult) => {
      console.log(
        `[pipeline] Project ${projectId} revision ${body.revisionNumber}: ${pipelineResult.status}`,
      )

      // Update revision status in database via Hasura
      if (body.revisionId && HASURA_ADMIN_SECRET) {
        try {
          const status = pipelineResult.status === 'completed' ? 'completed'
            : pipelineResult.status === 'interrupted' ? 'interrupted'
            : 'implementing' // failed stays implementing for retry
          const completedAt = pipelineResult.status === 'completed' ? new Date().toISOString() : undefined
          await updateRevisionStatus(
            HASURA_ENDPOINT,
            HASURA_ADMIN_SECRET,
            body.revisionId,
            status,
            completedAt,
          )
        } catch (err) {
          console.error(`[pipeline] Failed to update revision status:`, err)
        }
      }
    }).catch((err) => {
      console.error(
        `[pipeline] Project ${projectId} revision ${body.revisionNumber} error:`,
        err,
      )
    })

    return Response.json({ started: true })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: errMsg }, { status: 500 })
  }
}
