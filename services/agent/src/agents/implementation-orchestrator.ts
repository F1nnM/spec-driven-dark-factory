import { runReactAgent, type Tool } from './react-loop.js'
import { createClaudeCodeTool } from '../tools/claude-code-tool.js'
import { createReviewTool } from '../tools/review-tool.js'
import { execGit, checkoutBranch, diffBranches } from '../git/operations.js'
import type Anthropic from '@anthropic-ai/sdk'

export interface StepResult {
  stepNumber: number
  status: 'completed' | 'failed'
  reviewLoopCount: number
  reviewSummary: string | null
}

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Implementation Orchestrator agent. Your job is to implement code changes based on spec diffs using TDD (Test-Driven Development).

## Your Process
1. You will receive a spec diff showing what changed in this step
2. Use the claude_code tool to implement the changes using TDD:
   a. First, read the spec files to understand the requirements and acceptance criteria
   b. Write failing tests that verify the acceptance criteria
   c. Implement the code to make the tests pass
   d. Refactor if needed while keeping tests green
3. After implementation, get the implementation diff and submit it for code review using the code_review tool
4. If the review fails, use claude_code to address the review feedback, then re-submit for review
5. Continue until the review passes or you have exhausted your review loops

## Important Rules
- ALWAYS start with tests (TDD: red -> green -> refactor)
- Make sure all tests pass before submitting for review
- When addressing review feedback, focus on the specific issues mentioned
- Use the git_diff tool to get the current implementation diff before submitting for review
- The spec_commit_hash for the code_review tool is provided in your initial instructions

## Response Format
After the review cycle completes, respond with a JSON object:
{
  "status": "completed" or "failed",
  "reviewLoopCount": <number>,
  "reviewSummary": "<last review summary>"
}`

export function createOrchestratorTools(
  repoPath: string,
  specsPath: string,
): Tool[] {
  const claudeCodeTool = createClaudeCodeTool(repoPath)
  const reviewTool = createReviewTool(repoPath, specsPath)

  const gitDiffTool: Tool = {
    name: 'git_diff',
    description:
      'Get the git diff of the current implementation changes since the spec commit. Returns the diff as a string.',
    input_schema: {
      type: 'object' as const,
      properties: {
        spec_commit_hash: {
          type: 'string',
          description: 'The spec commit hash to diff against',
        },
      },
      required: ['spec_commit_hash'],
    },
    async execute(input: Record<string, unknown>): Promise<string> {
      const specCommitHash = input.spec_commit_hash as string
      try {
        return await execGit(repoPath, ['diff', specCommitHash, 'HEAD'])
      } catch (err) {
        return `Error getting diff: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  }

  return [claudeCodeTool, reviewTool, gitDiffTool]
}

export async function implementStep(
  repoPath: string,
  stepBranch: string,
  specCommitHash: string,
  specsPath: string,
  maxReviewLoops: number = 3,
  client?: Anthropic,
): Promise<StepResult> {
  // Extract step number from branch name (e.g., "revision-1-step-2" -> 2)
  const stepMatch = stepBranch.match(/step-(\d+)$/)
  const stepNumber = stepMatch ? parseInt(stepMatch[1], 10) : 0

  // Checkout the step branch
  await checkoutBranch(repoPath, stepBranch)

  // Get the spec diff to understand what to implement
  // The spec commit is the HEAD of the step branch; diff against the parent to see what changed
  let specDiff: string
  try {
    specDiff = await execGit(repoPath, ['diff', `${specCommitHash}^`, specCommitHash, '--', specsPath])
  } catch {
    // If parent doesn't exist (first commit), diff against empty tree
    try {
      specDiff = await execGit(repoPath, [
        'diff',
        '4b825dc642cb6eb9a060e54bf899d69f82cf21d3',
        specCommitHash,
        '--',
        specsPath,
      ])
    } catch {
      specDiff = 'Could not compute spec diff. Read the spec files directly.'
    }
  }

  const tools = createOrchestratorTools(repoPath, specsPath)

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: `Implement the changes described in the following spec diff for step branch "${stepBranch}".

## Spec Commit Hash
${specCommitHash}

## Spec Diff
\`\`\`diff
${specDiff}
\`\`\`

## Instructions
1. Use claude_code to read the spec files and understand the requirements
2. Use claude_code to write failing tests first (TDD)
3. Use claude_code to implement the code to make tests pass
4. Use git_diff with spec_commit_hash "${specCommitHash}" to get the implementation diff
5. Use code_review with the spec_commit_hash "${specCommitHash}" and the diff to submit for review
6. If review fails, address the feedback with claude_code and re-submit (max ${maxReviewLoops} review loops)

The specs are in the "${specsPath}" directory.`,
    },
  ]

  const result = await runReactAgent(
    {
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
      tools,
      model: 'claude-sonnet-4-6',
      maxSteps: maxReviewLoops * 10 + 10, // Allow enough steps for review loops
    },
    messages,
    client,
  )

  return parseStepResult(result.response, stepNumber)
}

function parseStepResult(response: string, stepNumber: number): StepResult {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*"status"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        status?: string
        reviewLoopCount?: number
        reviewSummary?: string
      }
      return {
        stepNumber,
        status: parsed.status === 'completed' ? 'completed' : 'failed',
        reviewLoopCount: parsed.reviewLoopCount ?? 0,
        reviewSummary: parsed.reviewSummary ?? null,
      }
    } catch {
      // Fall through
    }
  }

  // If we can't parse, assume failure
  return {
    stepNumber,
    status: 'failed',
    reviewLoopCount: 0,
    reviewSummary: `Could not parse orchestrator result: ${response.slice(0, 500)}`,
  }
}
