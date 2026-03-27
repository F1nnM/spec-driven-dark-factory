import { join, relative } from 'node:path'
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs'
import { execGit, checkoutBranch, getCurrentBranch, commitFiles } from '../git/operations.js'
import { parseSpecSafe } from '@spec-factory/shared'
import type { Tool } from '../agents/react-loop.js'

async function ensureBranch(repoPath: string, branch: string): Promise<void> {
  const current = await getCurrentBranch(repoPath)
  if (current !== branch) {
    await checkoutBranch(repoPath, branch)
  }
}

export function createGitSpecTools(repoPath: string, branch: string, specsPath: string): Tool[] {
  const fullSpecsPath = join(repoPath, specsPath)

  return [
    {
      name: 'read_all_specs',
      description:
        'Read all spec files from the current branch. Returns a JSON array of {path, content} objects.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async execute(): Promise<string> {
        await ensureBranch(repoPath, branch)

        // Use git ls-tree to find spec files
        let treeOutput: string
        try {
          treeOutput = await execGit(repoPath, [
            'ls-tree',
            '-r',
            '--name-only',
            'HEAD',
            specsPath,
          ])
        } catch {
          // No specs directory yet
          return JSON.stringify([])
        }

        if (!treeOutput.trim()) {
          return JSON.stringify([])
        }

        const files = treeOutput.split('\n').filter((f) => f.endsWith('.md'))
        const results: { path: string; content: string }[] = []

        for (const file of files) {
          const content = await execGit(repoPath, ['show', `HEAD:${file}`])
          results.push({ path: file, content })
        }

        return JSON.stringify(results)
      },
    },

    {
      name: 'read_spec',
      description: 'Read a single spec file by path. Returns the file content.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Path to the spec file relative to repo root' },
        },
        required: ['path'],
      },
      async execute(input: Record<string, unknown>): Promise<string> {
        await ensureBranch(repoPath, branch)
        const filePath = input.path as string
        try {
          const content = await execGit(repoPath, ['show', `HEAD:${filePath}`])
          return content
        } catch {
          // File might be new and not yet committed, try reading from working tree
          const { readFileSync } = await import('node:fs')
          const absPath = join(repoPath, filePath)
          if (existsSync(absPath)) {
            return readFileSync(absPath, 'utf-8')
          }
          return `Error: File not found: ${filePath}`
        }
      },
    },

    {
      name: 'write_spec',
      description:
        'Create or update a spec file on the branch. Writes the file to the working tree.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Path to the spec file relative to repo root (e.g., specs/SPEC-001-auth.md)',
          },
          content: { type: 'string', description: 'Full content of the spec file including frontmatter' },
        },
        required: ['path', 'content'],
      },
      async execute(input: Record<string, unknown>): Promise<string> {
        await ensureBranch(repoPath, branch)
        const filePath = input.path as string
        const content = input.content as string
        const absPath = join(repoPath, filePath)

        // Ensure directory exists
        const dir = absPath.substring(0, absPath.lastIndexOf('/'))
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }

        writeFileSync(absPath, content, 'utf-8')
        return `Wrote spec file: ${filePath}`
      },
    },

    {
      name: 'delete_spec',
      description: 'Delete a spec file from the branch.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Path to the spec file relative to repo root' },
        },
        required: ['path'],
      },
      async execute(input: Record<string, unknown>): Promise<string> {
        await ensureBranch(repoPath, branch)
        const filePath = input.path as string
        const absPath = join(repoPath, filePath)

        if (!existsSync(absPath)) {
          return `Error: File not found: ${filePath}`
        }

        unlinkSync(absPath)
        // Stage the deletion
        await execGit(repoPath, ['add', filePath])
        return `Deleted spec file: ${filePath}`
      },
    },

    {
      name: 'commit_specs',
      description: 'Commit current changes on the branch with a message. Returns the commit hash.',
      input_schema: {
        type: 'object' as const,
        properties: {
          message: { type: 'string', description: 'Commit message' },
        },
        required: ['message'],
      },
      async execute(input: Record<string, unknown>): Promise<string> {
        await ensureBranch(repoPath, branch)
        const message = input.message as string

        // Stage all changes in specs path
        await execGit(repoPath, ['add', specsPath])

        // Check if there are staged changes
        try {
          await execGit(repoPath, ['diff', '--cached', '--quiet'])
          return 'No changes to commit.'
        } catch {
          // diff --cached --quiet exits with 1 when there are staged changes — this is expected
        }

        await execGit(repoPath, ['commit', '-m', message])
        const hash = await execGit(repoPath, ['rev-parse', 'HEAD'])
        return `Committed: ${hash}`
      },
    },

    {
      name: 'list_categories',
      description:
        'List all unique categories from current spec files. Returns a JSON array of category strings.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async execute(): Promise<string> {
        await ensureBranch(repoPath, branch)

        let treeOutput: string
        try {
          treeOutput = await execGit(repoPath, [
            'ls-tree',
            '-r',
            '--name-only',
            'HEAD',
            specsPath,
          ])
        } catch {
          return JSON.stringify([])
        }

        if (!treeOutput.trim()) {
          return JSON.stringify([])
        }

        const files = treeOutput.split('\n').filter((f) => f.endsWith('.md'))
        const categories = new Set<string>()

        for (const file of files) {
          const content = await execGit(repoPath, ['show', `HEAD:${file}`])
          const spec = parseSpecSafe(file, content)
          if (spec) {
            categories.add(spec.meta.category)
          }
        }

        return JSON.stringify([...categories].sort())
      },
    },
  ]
}
