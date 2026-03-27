import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateRestructuring, executeRestructuring } from '../agents/spec-restructurer.js'
import { execGit } from '../git/operations.js'

const REPOS_BASE = process.env.REPOS_PATH ?? '/tmp/spec-factory-repos'

function repoPath(projectId: string): string {
  return join(REPOS_BASE, projectId)
}

export async function handleRestructureEvaluate(
  req: Request,
  projectId: string,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      branch?: string
      specsPath?: string
    }

    const repoDir = repoPath(projectId)
    if (!existsSync(repoDir)) {
      return Response.json({ error: 'Repository not found' }, { status: 404 })
    }

    const branch = body.branch ?? 'main'
    const specsPath = body.specsPath ?? 'specs'

    // Verify branch exists
    try {
      await execGit(repoDir, ['rev-parse', '--verify', branch])
    } catch {
      return Response.json(
        { error: `Branch ${branch} not found` },
        { status: 404 },
      )
    }

    const result = await evaluateRestructuring(repoDir, branch, specsPath)

    return Response.json(result)
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: errMsg }, { status: 500 })
  }
}

export async function handleRestructureExecute(
  req: Request,
  projectId: string,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      branch?: string
      specsPath?: string
    }

    const repoDir = repoPath(projectId)
    if (!existsSync(repoDir)) {
      return Response.json({ error: 'Repository not found' }, { status: 404 })
    }

    const branch = body.branch ?? 'main'
    const specsPath = body.specsPath ?? 'specs'

    // Verify branch exists
    try {
      await execGit(repoDir, ['rev-parse', '--verify', branch])
    } catch {
      return Response.json(
        { error: `Branch ${branch} not found` },
        { status: 404 },
      )
    }

    const result = await executeRestructuring(repoDir, branch, specsPath)

    return Response.json(result)
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: errMsg }, { status: 500 })
  }
}
