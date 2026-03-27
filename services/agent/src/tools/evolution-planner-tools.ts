import { join } from 'node:path'
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs'
import {
  execGit,
  checkoutBranch,
  createBranch,
  getCurrentBranch,
  getCommitHash,
} from '../git/operations.js'
import { listSpecFiles, readFileFromBranch } from '../api/specs.js'
import { parseSpecSafe, diffSpecs, type SpecChange } from '@spec-factory/shared'
import type { SpecFile } from '@spec-factory/shared'
import type { Tool } from '../agents/react-loop.js'

export interface EvolutionPlannerToolsContext {
  repoPath: string
  specsPath: string
  revisionNumber: number
  revisionBranch: string
}

async function readSpecsFromRef(
  repoPath: string,
  ref: string,
  specsPath: string,
): Promise<SpecFile[]> {
  const files = await listSpecFiles(repoPath, ref, specsPath)
  const specs: SpecFile[] = []
  for (const filePath of files) {
    try {
      const content = await readFileFromBranch(repoPath, ref, filePath)
      const spec = parseSpecSafe(filePath, content)
      if (spec) specs.push(spec)
    } catch {
      // skip unreadable files
    }
  }
  return specs
}

export function createEvolutionPlannerTools(ctx: EvolutionPlannerToolsContext): Tool[] {
  const { repoPath, specsPath, revisionNumber, revisionBranch } = ctx

  return [
    {
      name: 'analyze_diff',
      description:
        'Compute the structured diff between main branch specs (S1) and revision branch specs (S2). Returns a JSON array of SpecChange objects with type (added/modified/removed), specId, spec content, and fieldChanges.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async execute(): Promise<string> {
        const mainSpecs = await readSpecsFromRef(repoPath, 'main', specsPath)
        const revisionSpecs = await readSpecsFromRef(repoPath, revisionBranch, specsPath)
        const changes = diffSpecs(mainSpecs, revisionSpecs)
        return JSON.stringify(changes, null, 2)
      },
    },

    {
      name: 'create_step_branch',
      description:
        'Create a step branch (revision-N/step-M) from the revision branch and commit the specified spec changes for that step. The specPaths should be paths of specs to include in this step. For "add" or "modify" actions, the spec content from the revision branch is used. For "remove" actions, the spec is deleted.',
      input_schema: {
        type: 'object' as const,
        properties: {
          stepNumber: {
            type: 'number',
            description: 'The step number (1-based)',
          },
          description: {
            type: 'string',
            description: 'Description of what this step accomplishes',
          },
          specChanges: {
            type: 'array',
            description: 'Array of spec changes for this step',
            items: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'Path to the spec file relative to repo root',
                },
                action: {
                  type: 'string',
                  enum: ['add', 'modify', 'remove'],
                  description: 'What action to take on this spec',
                },
              },
              required: ['path', 'action'],
            },
          },
        },
        required: ['stepNumber', 'description', 'specChanges'],
      },
      async execute(input: Record<string, unknown>): Promise<string> {
        const stepNumber = input.stepNumber as number
        const description = input.description as string
        const specChanges = input.specChanges as { path: string; action: string }[]

        const stepBranch = `revision-${revisionNumber}-step-${stepNumber}`

        // Determine the base: if step > 1, branch from the previous step; otherwise from the revision branch
        let baseBranch: string
        if (stepNumber > 1) {
          const prevStepBranch = `revision-${revisionNumber}-step-${stepNumber - 1}`
          // Check if previous step branch exists
          try {
            await execGit(repoPath, ['rev-parse', '--verify', prevStepBranch])
            baseBranch = prevStepBranch
          } catch {
            // Previous step doesn't exist, fall back to main
            baseBranch = 'main'
          }
        } else {
          baseBranch = 'main'
        }

        // Create step branch from base
        try {
          await execGit(repoPath, ['rev-parse', '--verify', stepBranch])
          // Branch already exists, delete it to recreate
          const current = await getCurrentBranch(repoPath)
          if (current === stepBranch) {
            await checkoutBranch(repoPath, baseBranch)
          }
          await execGit(repoPath, ['branch', '-D', stepBranch])
        } catch {
          // Branch doesn't exist, that's fine
        }

        await checkoutBranch(repoPath, baseBranch)
        await createBranch(repoPath, stepBranch)
        await checkoutBranch(repoPath, stepBranch)

        // Apply spec changes
        const fullSpecsPath = join(repoPath, specsPath)
        if (!existsSync(fullSpecsPath)) {
          mkdirSync(fullSpecsPath, { recursive: true })
        }

        const filesToStage: string[] = []

        for (const change of specChanges) {
          const absPath = join(repoPath, change.path)
          if (change.action === 'remove') {
            if (existsSync(absPath)) {
              unlinkSync(absPath)
            }
            // Stage the removal
            await execGit(repoPath, ['add', change.path])
            filesToStage.push(change.path)
          } else {
            // add or modify: get content from revision branch
            try {
              const content = await readFileFromBranch(repoPath, revisionBranch, change.path)
              const dir = absPath.substring(0, absPath.lastIndexOf('/'))
              if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true })
              }
              writeFileSync(absPath, content, 'utf-8')
              await execGit(repoPath, ['add', change.path])
              filesToStage.push(change.path)
            } catch (err) {
              return `Error: Could not read ${change.path} from ${revisionBranch}: ${err instanceof Error ? err.message : String(err)}`
            }
          }
        }

        // Check if there are changes to commit
        try {
          await execGit(repoPath, ['diff', '--cached', '--quiet'])
          return `No spec changes to commit for step ${stepNumber}.`
        } catch {
          // There are staged changes — expected
        }

        // Commit
        await execGit(repoPath, [
          'commit',
          '-m',
          `Step ${stepNumber}: ${description}`,
        ])
        const hash = await getCommitHash(repoPath)

        return JSON.stringify({
          stepNumber,
          branchName: stepBranch,
          specCommitHash: hash,
          description,
          specChanges,
        })
      },
    },

    {
      name: 'list_steps',
      description:
        'List existing step branches for this revision. Returns a JSON array of { stepNumber, branchName } objects.',
      input_schema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
      async execute(): Promise<string> {
        const prefix = `revision-${revisionNumber}-step-`
        let branchOutput: string
        try {
          branchOutput = await execGit(repoPath, ['branch', '--list', `${prefix}*`])
        } catch {
          return JSON.stringify([])
        }

        if (!branchOutput.trim()) {
          return JSON.stringify([])
        }

        const steps = branchOutput
          .split('\n')
          .map((b) => b.trim().replace(/^\*\s*/, ''))
          .filter((b) => b.startsWith(prefix))
          .map((b) => {
            const stepNum = parseInt(b.substring(prefix.length), 10)
            return { stepNumber: stepNum, branchName: b }
          })
          .sort((a, b) => a.stepNumber - b.stepNumber)

        return JSON.stringify(steps)
      },
    },
  ]
}
