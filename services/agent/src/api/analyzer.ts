import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeCodebase } from '../agents/codebase-analyzer.js'

const REPOS_BASE = process.env.REPOS_PATH ?? '/tmp/spec-factory-repos'

function repoPath(projectId: string): string {
  return join(REPOS_BASE, projectId)
}

export async function handleAnalyze(
  req: Request,
  projectId: string,
): Promise<Response> {
  try {
    const body = (await req.json()) as {
      specsPath?: string
      branch?: string
    }

    const repoDir = repoPath(projectId)
    if (!existsSync(repoDir)) {
      return Response.json({ error: 'Repository not found' }, { status: 404 })
    }

    const specsPath = body.specsPath ?? 'specs'
    const branch = body.branch ?? 'main'

    const result = await analyzeCodebase(repoDir, specsPath, branch)

    return Response.json(result)
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: errMsg }, { status: 500 })
  }
}
