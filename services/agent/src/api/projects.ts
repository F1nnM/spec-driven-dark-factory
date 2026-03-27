import { writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { cloneRepo, getCurrentBranch, getCommitHash } from '../git/operations'

const REPOS_BASE = process.env.REPOS_PATH ?? '/tmp/spec-factory-repos'

function repoPath(projectId: string): string {
  return join(REPOS_BASE, projectId)
}

function sshKeyPath(projectId: string): string {
  return join(REPOS_BASE, '.keys', `${projectId}.pem`)
}

function writeSshKey(projectId: string, sshKey: string): string {
  const keysDir = join(REPOS_BASE, '.keys')
  if (!existsSync(keysDir)) {
    mkdirSync(keysDir, { recursive: true, mode: 0o700 })
  }
  const keyFile = sshKeyPath(projectId)
  writeFileSync(keyFile, sshKey, { mode: 0o600 })
  chmodSync(keyFile, 0o600)
  return keyFile
}

export async function handleClone(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      gitUrl: string
      sshKey: string
      projectId: string
    }

    if (!body.gitUrl || !body.projectId) {
      return Response.json({ error: 'gitUrl and projectId are required' }, { status: 400 })
    }

    const dest = repoPath(body.projectId)

    if (existsSync(dest)) {
      return Response.json({ error: 'Repository already cloned' }, { status: 409 })
    }

    if (!existsSync(REPOS_BASE)) {
      mkdirSync(REPOS_BASE, { recursive: true })
    }

    const keyFile = writeSshKey(body.projectId, body.sshKey)
    await cloneRepo(body.gitUrl, keyFile, dest)

    return Response.json({ ok: true, path: dest })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function handleStatus(req: Request, projectId: string): Promise<Response> {
  try {
    const dest = repoPath(projectId)

    if (!existsSync(dest)) {
      return Response.json({ error: 'Repository not found' }, { status: 404 })
    }

    const branch = await getCurrentBranch(dest)
    const commitHash = await getCommitHash(dest)

    return Response.json({ projectId, branch, commitHash, path: dest })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
