import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { auditFulfillment } from '../agents/fulfillment-auditor.js'

const REPOS_BASE = process.env.REPOS_PATH ?? '/tmp/spec-factory-repos'

function repoPath(projectId: string): string {
  return join(REPOS_BASE, projectId)
}

export async function handleAudit(
  req: Request,
  projectId: string,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      branch: string
      specsPath?: string
    }

    if (!body.branch) {
      return Response.json(
        { error: 'branch is required' },
        { status: 400 },
      )
    }

    const repoDir = repoPath(projectId)
    if (!existsSync(repoDir)) {
      return Response.json({ error: 'Repository not found' }, { status: 404 })
    }

    const specsPath = body.specsPath ?? 'specs'
    const results = await auditFulfillment(repoDir, body.branch, specsPath)

    return Response.json({ results })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: errMsg }, { status: 500 })
  }
}
