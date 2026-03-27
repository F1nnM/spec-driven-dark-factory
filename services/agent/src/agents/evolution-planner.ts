import { runReactAgent } from './react-loop.js'
import {
  createEvolutionPlannerTools,
  type EvolutionPlannerToolsContext,
} from '../tools/evolution-planner-tools.js'
import { execGit, checkoutBranch } from '../git/operations.js'

export interface EvolutionPlannerContext {
  projectId: string
  repoPath: string
  specsPath: string
  revisionNumber: number
  revisionBranch: string // e.g., 'revision-1'
}

export interface EvolutionStep {
  stepNumber: number
  description: string
  specChanges: { path: string; action: 'add' | 'modify' | 'remove' }[]
  branchName: string
  specCommitHash: string
}

const SYSTEM_PROMPT = `You are the Evolution Planner agent for a spec-driven development platform. Your role is to decompose the diff between the current specs (S1 on main) and the revised specs (S2 on the revision branch) into sequential evolution steps.

## What You Do
1. Analyze the spec diff between main and the revision branch
2. Plan a sequence of evolution steps that transition from S1 to S2
3. Create step branches with the spec changes for each step

## Rules
1. FIRST, call analyze_diff to see all spec changes between S1 and S2.
2. Group related spec changes together into steps. Changes that logically belong together (e.g., a spec and its dependencies) should be in the same step.
3. Consider dependencies: if spec B depends on spec A, and both are new, spec A must come in an earlier or same step as spec B.
4. Each step should be substantial enough for a full review cycle. Don't create too many tiny steps — review is expensive. Err on the side of fewer, larger steps.
5. Each step should be independently testable and reviewable — the spec state after each step should be coherent.
6. After planning, create step branches using create_step_branch for each step in order (step 1 first, then step 2, etc.).
7. After creating all steps, respond with a JSON array of the steps you created. The response MUST be valid JSON and nothing else — no markdown fencing, no explanation text outside the JSON.

## Response Format
Your final response must be a JSON array:
[
  {
    "stepNumber": 1,
    "description": "...",
    "specChanges": [{"path": "...", "action": "add|modify|remove"}],
    "branchName": "revision-N-step-1",
    "specCommitHash": "abc123..."
  }
]
`

export async function planEvolution(
  context: EvolutionPlannerContext,
  client?: import('@anthropic-ai/sdk').default,
): Promise<EvolutionStep[]> {
  const toolsCtx: EvolutionPlannerToolsContext = {
    repoPath: context.repoPath,
    specsPath: context.specsPath,
    revisionNumber: context.revisionNumber,
    revisionBranch: context.revisionBranch,
  }

  const tools = createEvolutionPlannerTools(toolsCtx)

  const messages: import('@anthropic-ai/sdk').default.Messages.MessageParam[] = [
    {
      role: 'user',
      content: `Plan evolution steps for revision ${context.revisionNumber}. The revision branch is "${context.revisionBranch}" and specs are in "${context.specsPath}". Analyze the diff and create step branches.`,
    },
  ]

  const result = await runReactAgent(
    {
      systemPrompt: SYSTEM_PROMPT,
      tools,
      model: 'claude-sonnet-4-6',
      maxSteps: 20,
    },
    messages,
    client,
  )

  // Parse the response as JSON array of steps
  const responseText = result.response.trim()

  // Try to extract JSON from the response (handle markdown fencing if present)
  let jsonText = responseText
  const jsonMatch = responseText.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    jsonText = jsonMatch[0]
  }

  try {
    const steps = JSON.parse(jsonText) as EvolutionStep[]
    return steps
  } catch {
    // If we can't parse the response, try to reconstruct from list_steps
    const listStepsTool = tools.find((t) => t.name === 'list_steps')!
    const stepsJson = await listStepsTool.execute({})
    const existingSteps = JSON.parse(stepsJson) as {
      stepNumber: number
      branchName: string
    }[]

    // Build steps from branch info
    const steps: EvolutionStep[] = []
    for (const existing of existingSteps) {
      const hash = await execGit(context.repoPath, [
        'rev-parse',
        existing.branchName,
      ])
      const commitMsg = await execGit(context.repoPath, [
        'log',
        '-1',
        '--format=%s',
        existing.branchName,
      ])

      steps.push({
        stepNumber: existing.stepNumber,
        description: commitMsg.replace(/^Step \d+: /, ''),
        specChanges: [],
        branchName: existing.branchName,
        specCommitHash: hash,
      })
    }

    return steps
  }
}

export async function squashRevisionBranch(
  repoPath: string,
  revisionBranch: string,
): Promise<string> {
  // Get the merge-base with main
  const mergeBase = await execGit(repoPath, [
    'merge-base',
    'main',
    revisionBranch,
  ])

  await checkoutBranch(repoPath, revisionBranch)

  // Soft reset to the merge base to squash all commits
  await execGit(repoPath, ['reset', '--soft', mergeBase])

  // Check if there's anything to commit
  try {
    await execGit(repoPath, ['diff', '--cached', '--quiet'])
    // No changes — nothing to squash
    const hash = await execGit(repoPath, ['rev-parse', 'HEAD'])
    return hash
  } catch {
    // There are staged changes
  }

  await execGit(repoPath, ['commit', '-m', `Squashed spec changes for ${revisionBranch}`])
  const hash = await execGit(repoPath, ['rev-parse', 'HEAD'])
  return hash
}
