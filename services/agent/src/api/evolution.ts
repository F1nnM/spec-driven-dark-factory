import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  planEvolution,
  squashRevisionBranch,
  type EvolutionStep,
} from '../agents/evolution-planner.js'
import { execGit } from '../git/operations.js'

const REPOS_BASE = process.env.REPOS_PATH ?? '/tmp/spec-factory-repos'

function repoPath(projectId: string): string {
  return join(REPOS_BASE, projectId)
}

export async function handlePlan(
  req: Request,
  projectId: string,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      revisionNumber: number
      specsPath?: string
    }

    if (body.revisionNumber == null) {
      return Response.json(
        { error: 'revisionNumber is required' },
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

    const steps = await planEvolution({
      projectId,
      repoPath: repoDir,
      specsPath,
      revisionNumber: body.revisionNumber,
      revisionBranch,
    })

    return Response.json({ steps })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: errMsg }, { status: 500 })
  }
}

export async function handleApprove(
  req: Request,
  projectId: string,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      revisionNumber: number
      specsPath?: string
    }

    if (body.revisionNumber == null) {
      return Response.json(
        { error: 'revisionNumber is required' },
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

    // 1. Squash spec commits on the revision branch
    await squashRevisionBranch(repoDir, revisionBranch)

    // 2. Run the evolution planner
    const steps = await planEvolution({
      projectId,
      repoPath: repoDir,
      specsPath,
      revisionNumber: body.revisionNumber,
      revisionBranch,
    })

    return Response.json({ steps })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: errMsg }, { status: 500 })
  }
}
