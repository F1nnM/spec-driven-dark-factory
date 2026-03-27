import { runReactAgent, type Tool } from './react-loop.js'
import { createGitSpecTools } from '../tools/git-spec-tools.js'
import { checkoutBranch, getCurrentBranch } from '../git/operations.js'
import type Anthropic from '@anthropic-ai/sdk'

const EVALUATE_SYSTEM_PROMPT = `You are a Spec Restructurer evaluator for a spec-driven development platform. Your job is to evaluate the health of a project's spec graph.

## What You Evaluate
1. **Category coherence**: Are specs grouped into logical, consistent categories? Are there too many or too few categories?
2. **Relation completeness**: Do specs properly reference their dependencies (depends_on) and related specs (relates_to)? Are there missing or incorrect relations?
3. **Granularity**: Are specs at an appropriate level of detail? Are some too broad or too narrow?
4. **Naming consistency**: Do spec titles follow consistent patterns?
5. **Structure quality**: Do all specs have proper Overview and Acceptance Criteria sections?

## Output Format
You MUST return a JSON object with exactly this format (and nothing else):
{
  "score": <number 0-100>,
  "reasoning": "<detailed explanation>"
}

Where:
- score 0-30: Healthy spec graph, minimal restructuring needed
- score 31-65: Some issues, consider restructuring
- score 66-100: Significant issues, restructuring recommended

Be honest and specific in your reasoning.`

const EXECUTE_SYSTEM_PROMPT = `You are a Spec Restructurer agent for a spec-driven development platform. Your job is to restructure spec files to improve the spec graph's health.

## What You Do
1. Read all current specs
2. Reorganize categories for better coherence
3. Fix missing or incorrect relations (depends_on, relates_to)
4. Split overly broad specs or merge overly narrow ones
5. Ensure consistent naming and structure
6. Commit the changes

## Rules
- Do NOT change the meaning or intent of any spec
- Restructuring should be about organization, not content changes
- Keep the same spec IDs where possible
- When splitting a spec, create new IDs for the new specs
- Always commit your changes with a descriptive message
- After restructuring, respond with a summary of changes made

## Today's Date
Use today's date for updated fields: ${new Date().toISOString().split('T')[0]}`

export async function evaluateRestructuring(
  repoPath: string,
  branch: string,
  specsPath: string,
  client?: Anthropic,
): Promise<{ score: number; reasoning: string }> {
  const currentBranch = await getCurrentBranch(repoPath)
  if (currentBranch !== branch) {
    await checkoutBranch(repoPath, branch)
  }

  const tools = createGitSpecTools(repoPath, branch, specsPath)
  // Only need read tools for evaluation
  const readOnlyTools: Tool[] = tools.filter(
    (t) => t.name === 'read_all_specs' || t.name === 'read_spec' || t.name === 'list_categories',
  )

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: `Evaluate the health of the spec graph in this project. Read all specs and analyze their structure, categories, relations, and granularity. Return your evaluation as a JSON object with "score" (0-100) and "reasoning" fields.`,
    },
  ]

  const result = await runReactAgent(
    {
      systemPrompt: EVALUATE_SYSTEM_PROMPT,
      tools: readOnlyTools,
      model: 'claude-sonnet-4-6',
      maxSteps: 10,
    },
    messages,
    client,
  )

  return parseEvaluationResult(result.response)
}

export async function executeRestructuring(
  repoPath: string,
  branch: string,
  specsPath: string,
  client?: Anthropic,
): Promise<{ summary: string }> {
  const currentBranch = await getCurrentBranch(repoPath)
  if (currentBranch !== branch) {
    await checkoutBranch(repoPath, branch)
  }

  const tools = createGitSpecTools(repoPath, branch, specsPath)

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: `Restructure the specs in this project to improve the spec graph's health. Read all specs, analyze their organization, and make improvements to categories, relations, structure, and granularity. Commit your changes when done.`,
    },
  ]

  const result = await runReactAgent(
    {
      systemPrompt: EXECUTE_SYSTEM_PROMPT,
      tools,
      model: 'claude-sonnet-4-6',
      maxSteps: 25,
    },
    messages,
    client,
  )

  return { summary: result.response }
}

function parseEvaluationResult(response: string): { score: number; reasoning: string } {
  const jsonMatch = response.match(/\{[\s\S]*"score"[\s\S]*"reasoning"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: number; reasoning?: string }
      const score = Math.max(0, Math.min(100, Number(parsed.score ?? 50)))
      const reasoning = String(parsed.reasoning ?? 'No reasoning provided.')
      return { score, reasoning }
    } catch {
      // Fall through
    }
  }

  // Also try with reasoning before score
  const jsonMatch2 = response.match(/\{[\s\S]*"reasoning"[\s\S]*"score"[\s\S]*\}/)
  if (jsonMatch2) {
    try {
      const parsed = JSON.parse(jsonMatch2[0]) as { score?: number; reasoning?: string }
      const score = Math.max(0, Math.min(100, Number(parsed.score ?? 50)))
      const reasoning = String(parsed.reasoning ?? 'No reasoning provided.')
      return { score, reasoning }
    } catch {
      // Fall through
    }
  }

  return {
    score: 50,
    reasoning: 'Could not parse evaluation result. Manual review recommended.',
  }
}
