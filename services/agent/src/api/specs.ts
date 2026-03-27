import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execGit } from '../git/operations.js'
import { parseSpecSafe, buildSpecIndex } from '@spec-factory/shared'
import type { SpecFile } from '@spec-factory/shared'

const REPOS_BASE = process.env.REPOS_PATH ?? '/tmp/spec-factory-repos'

function repoPath(projectId: string): string {
  return join(REPOS_BASE, projectId)
}

export async function listSpecFiles(
  repoPath: string,
  branch: string,
  specsPath: string,
): Promise<string[]> {
  try {
    const output = await execGit(repoPath, [
      'ls-tree',
      '-r',
      '--name-only',
      branch,
      specsPath,
    ])
    if (!output) return []
    return output
      .split('\n')
      .filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
}

export async function readFileFromBranch(
  repoPath: string,
  branch: string,
  filePath: string,
): Promise<string> {
  return execGit(repoPath, ['show', `${branch}:${filePath}`])
}

export async function handleGetSpecs(
  req: Request,
  projectId: string,
): Promise<Response> {
  try {
    const dest = repoPath(projectId)

    if (!existsSync(dest)) {
      return Response.json({ error: 'Repository not found' }, { status: 404 })
    }

    const url = new URL(req.url)
    const branch = url.searchParams.get('branch') ?? 'main'
    const specsPath = url.searchParams.get('specsPath') ?? '/specs'

    // Normalize specsPath: remove leading slash for git ls-tree
    const normalizedSpecsPath = specsPath.replace(/^\//, '')

    const files = await listSpecFiles(dest, branch, normalizedSpecsPath)

    const specs: SpecFile[] = []
    for (const filePath of files) {
      try {
        const content = await readFileFromBranch(dest, branch, filePath)
        const spec = parseSpecSafe(filePath, content)
        if (spec) {
          specs.push(spec)
        }
      } catch {
        // Skip files that can't be read
      }
    }

    const index = buildSpecIndex(specs)

    // Convert Maps/Sets to plain objects for JSON serialization
    const serializableIndex = {
      dependencies: Object.fromEntries(
        Array.from(index.dependencies.entries()).map(([k, v]) => [k, Array.from(v)]),
      ),
      dependents: Object.fromEntries(
        Array.from(index.dependents.entries()).map(([k, v]) => [k, Array.from(v)]),
      ),
      related: Object.fromEntries(
        Array.from(index.related.entries()).map(([k, v]) => [k, Array.from(v)]),
      ),
    }

    return Response.json({ specs, index: serializableIndex })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
