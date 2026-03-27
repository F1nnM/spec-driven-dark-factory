import { spawn } from 'node:child_process'

class GitError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
  ) {
    super(message)
    this.name = 'GitError'
  }
}

async function execGit(
  repoPath: string,
  args: string[],
  env?: Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd: repoPath,
      env: { ...process.env, ...env },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(
          new GitError(
            `git ${args.join(' ')} failed (exit ${code}): ${stderr.trim()}`,
            code,
            stderr,
          ),
        )
      } else {
        resolve(stdout.trim())
      }
    })

    proc.on('error', (err) => {
      reject(new GitError(`git ${args.join(' ')} error: ${err.message}`, null, ''))
    })
  })
}

function sshEnv(sshKeyPath: string): Record<string, string> {
  return {
    GIT_SSH_COMMAND: `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`,
  }
}

export async function cloneRepo(
  url: string,
  sshKeyPath: string,
  destPath: string,
): Promise<void> {
  // Clone runs from parent dir; git clone creates destPath
  const { dirname } = await import('node:path')
  const parentDir = dirname(destPath)
  const baseName = destPath.split('/').pop()!
  await execGit(parentDir, ['clone', url, baseName], sshEnv(sshKeyPath))
}

export async function createBranch(
  repoPath: string,
  branchName: string,
  startPoint?: string,
): Promise<void> {
  const args = ['branch', branchName]
  if (startPoint) args.push(startPoint)
  await execGit(repoPath, args)
}

export async function checkoutBranch(
  repoPath: string,
  branchName: string,
): Promise<void> {
  await execGit(repoPath, ['checkout', branchName])
}

export async function commitFiles(
  repoPath: string,
  files: string[],
  message: string,
): Promise<string> {
  await execGit(repoPath, ['add', ...files])
  await execGit(repoPath, ['commit', '-m', message])
  return getCommitHash(repoPath)
}

export async function mergeBranch(
  repoPath: string,
  source: string,
  target: string,
): Promise<void> {
  await execGit(repoPath, ['checkout', target])
  await execGit(repoPath, ['merge', source])
}

export async function tagRevision(
  repoPath: string,
  tag: string,
  message?: string,
): Promise<void> {
  if (message) {
    await execGit(repoPath, ['tag', '-a', tag, '-m', message])
  } else {
    await execGit(repoPath, ['tag', tag])
  }
}

export async function diffBranches(
  repoPath: string,
  base: string,
  head: string,
  paths?: string[],
): Promise<string> {
  const args = ['diff', `${base}...${head}`]
  if (paths && paths.length > 0) {
    args.push('--', ...paths)
  }
  return execGit(repoPath, args)
}

export async function pushBranch(
  repoPath: string,
  branchName: string,
): Promise<void> {
  await execGit(repoPath, ['push', 'origin', branchName])
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  return execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
}

export async function getCommitHash(
  repoPath: string,
  ref?: string,
): Promise<string> {
  return execGit(repoPath, ['rev-parse', ref ?? 'HEAD'])
}
