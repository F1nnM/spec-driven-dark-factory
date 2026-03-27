import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runPipeline, type PipelineStep } from '../agents/pipeline-runner.js'
import { execGit } from '../git/operations.js'

const REPOS_BASE = process.env.REPOS_PATH ?? '/tmp/spec-factory-repos'

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
      steps: PipelineStep[]
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

    // Start pipeline asynchronously
    runPipeline(
      projectId,
      repoDir,
      body.revisionNumber,
      body.steps,
      specsPath,
      (stepResult) => {
        // Log step updates — in a full implementation this would update the database
        console.log(
          `[pipeline] Project ${projectId} revision ${body.revisionNumber} step ${stepResult.stepNumber}: ${stepResult.status}`,
        )
      },
    ).then((pipelineResult) => {
      console.log(
        `[pipeline] Project ${projectId} revision ${body.revisionNumber}: ${pipelineResult.status}`,
      )
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
