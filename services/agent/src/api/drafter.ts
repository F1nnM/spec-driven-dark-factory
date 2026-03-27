import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { runSpecDrafter } from '../agents/spec-drafter.js'
import { execGit } from '../git/operations.js'
import { createBranch, checkoutBranch } from '../git/operations.js'
import { parseSpecSafe } from '@spec-factory/shared'
import type { SpecFile } from '@spec-factory/shared'

const REPOS_BASE = process.env.REPOS_PATH ?? '/tmp/spec-factory-repos'

function repoPath(projectId: string): string {
  return join(REPOS_BASE, projectId)
}

async function ensureRevisionBranch(repoDir: string, revisionNumber: number): Promise<void> {
  const branchName = `revision-${revisionNumber}`

  // Check if branch already exists
  try {
    await execGit(repoDir, ['rev-parse', '--verify', branchName])
    // Branch exists
    return
  } catch {
    // Branch doesn't exist, create it from main
  }

  // Determine main branch name
  let mainBranch: string
  try {
    mainBranch = await execGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    mainBranch = 'main'
  }

  // Check if we're on a different branch; go to main first
  const currentBranch = await execGit(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (currentBranch !== mainBranch && currentBranch !== branchName) {
    await checkoutBranch(repoDir, mainBranch)
  }

  await createBranch(repoDir, branchName)
}

async function readSpecsFromBranch(repoDir: string, specsPath: string, branch: string): Promise<SpecFile[]> {
  await checkoutBranch(repoDir, branch)

  let treeOutput: string
  try {
    treeOutput = await execGit(repoDir, ['ls-tree', '-r', '--name-only', 'HEAD', specsPath])
  } catch {
    return []
  }

  if (!treeOutput.trim()) {
    return []
  }

  const files = treeOutput.split('\n').filter((f) => f.endsWith('.md'))
  const specs: SpecFile[] = []

  for (const file of files) {
    const content = await execGit(repoDir, ['show', `HEAD:${file}`])
    const spec = parseSpecSafe(file, content)
    if (spec) {
      specs.push(spec)
    }
  }

  return specs
}

export async function handleDraft(req: Request, projectId: string): Promise<Response> {
  try {
    const body = (await req.json()) as {
      message: string
      revisionNumber: number
      specsPath?: string
      messages?: Anthropic.Messages.MessageParam[]
    }

    if (!body.message || body.revisionNumber == null) {
      return Response.json(
        { error: 'message and revisionNumber are required' },
        { status: 400 },
      )
    }

    const repoDir = repoPath(projectId)
    if (!existsSync(repoDir)) {
      return Response.json({ error: 'Repository not found' }, { status: 404 })
    }

    const specsPath = body.specsPath ?? 'specs'
    const chatHistory = body.messages ?? []

    // Ensure revision branch exists
    await ensureRevisionBranch(repoDir, body.revisionNumber)

    // Run the spec drafter agent
    const result = await runSpecDrafter(
      {
        projectId,
        repoPath: repoDir,
        specsPath,
        revisionNumber: body.revisionNumber,
      },
      body.message,
      chatHistory,
    )

    // Read current specs on the branch after changes
    const branchName = `revision-${body.revisionNumber}`
    const specs = await readSpecsFromBranch(repoDir, specsPath, branchName)

    return Response.json({
      response: result.response,
      specs,
      updatedHistory: result.updatedHistory,
    })
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: errMsg }, { status: 500 })
  }
}
