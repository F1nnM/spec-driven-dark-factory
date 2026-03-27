import { runReactAgent, type Tool } from './react-loop.js'
import { createClaudeCodeTool } from '../tools/claude-code-tool.js'
import { listSpecFiles, readFileFromBranch } from '../api/specs.js'
import type Anthropic from '@anthropic-ai/sdk'

export interface ReviewResult {
  passed: boolean
  summary: string
  issues: string[]
}

const REVIEWER_SYSTEM_PROMPT = `You are a Code Reviewer agent for a spec-driven development platform. Your job is to review implementation code against specification acceptance criteria.

## Your Process
1. You will be given spec files and an implementation diff
2. Use the claude_code tool to analyze the actual source code in the repository if you need more context beyond the diff
3. Check each spec's acceptance criteria against the implementation
4. Verify tests exist and appear correct for each acceptance criterion
5. Check for obvious bugs or missing functionality
6. Be pragmatic — do NOT fail for style issues, naming conventions, or minor preferences
7. Focus on functional correctness and spec compliance

## Important Rules
- Only fail a review for genuine issues: missing functionality, broken tests, unmet acceptance criteria, or clear bugs
- A passing review means: the code implements what the specs describe, tests exist, and no obvious bugs
- Return your verdict as a JSON object (and nothing else) with this exact format:
{
  "passed": true/false,
  "summary": "Brief summary of the review",
  "issues": ["issue 1", "issue 2"]
}

If passed is true, issues should be an empty array.`

export async function reviewCode(
  repoPath: string,
  specCommitHash: string,
  implementationDiff: string,
  specsPath: string,
  client?: Anthropic,
): Promise<ReviewResult> {
  // Read all spec files from the spec commit
  const specFiles = await listSpecFiles(repoPath, specCommitHash, specsPath)
  const specContents: { path: string; content: string }[] = []

  for (const filePath of specFiles) {
    try {
      const content = await readFileFromBranch(repoPath, specCommitHash, filePath)
      specContents.push({ path: filePath, content })
    } catch {
      // Skip files that can't be read
    }
  }

  const specsText = specContents
    .map((s) => `### ${s.path}\n\`\`\`markdown\n${s.content}\n\`\`\``)
    .join('\n\n')

  const tools: Tool[] = [createClaudeCodeTool(repoPath)]

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: `Review the following implementation against the specs.

## Spec Files
${specsText}

## Implementation Diff
\`\`\`diff
${implementationDiff}
\`\`\`

Analyze the code against the specs. Use the claude_code tool if you need to inspect specific files for more context. Then return your review verdict as JSON.`,
    },
  ]

  const result = await runReactAgent(
    {
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      tools,
      model: 'claude-sonnet-4-6',
      maxSteps: 10,
    },
    messages,
    client,
  )

  return parseReviewResult(result.response)
}

function parseReviewResult(response: string): ReviewResult {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*"passed"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as ReviewResult
      return {
        passed: Boolean(parsed.passed),
        summary: String(parsed.summary ?? ''),
        issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      }
    } catch {
      // Fall through to default
    }
  }

  // If we can't parse, treat it as a failure with the full response as summary
  return {
    passed: false,
    summary: `Could not parse review result. Raw response: ${response.slice(0, 500)}`,
    issues: ['Review response was not valid JSON'],
  }
}
