import { runReactAgent, type Tool } from './react-loop.js'
import { createClaudeCodeTool } from '../tools/claude-code-tool.js'
import { listSpecFiles, readFileFromBranch } from '../api/specs.js'
import { parseSpec, writeSpec } from '@spec-factory/shared'
import { execGit, checkoutBranch, getCurrentBranch } from '../git/operations.js'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'

export interface FulfillmentResult {
  specId: string
  fulfillment: 'unfulfilled' | 'partial' | 'fulfilled'
  explanation: string
}

const AUDITOR_SYSTEM_PROMPT = `You are a Fulfillment Auditor agent for a spec-driven development platform. Your job is to analyze whether each spec's acceptance criteria are actually met by the current codebase.

## Your Process
1. You will be given a list of spec files with their content
2. For each spec, use the claude_code tool to search the codebase for implementations
3. Check if the acceptance criteria listed in the spec are met by actual code
4. Check if tests exist and appear to cover the acceptance criteria
5. Be honest about partial fulfillment — if some criteria are met but not all, mark as "partial"

## Rules
- "fulfilled" means ALL acceptance criteria are clearly met with working code and tests
- "partial" means SOME acceptance criteria are met but not all
- "unfulfilled" means NONE of the acceptance criteria are met or the implementation doesn't exist
- Be thorough: actually search for the relevant code, don't guess
- Look at both source code and test files

## Output Format
Return your results as a JSON array (and nothing else) with this exact format:
[
  {
    "specId": "SPEC-001",
    "fulfillment": "fulfilled",
    "explanation": "All acceptance criteria met. Implementation found in src/auth.ts with tests in tests/auth.test.ts."
  },
  ...
]`

export async function auditFulfillment(
  repoPath: string,
  branch: string,
  specsPath: string,
  client?: Anthropic,
): Promise<FulfillmentResult[]> {
  // Ensure we're on the right branch
  const currentBranch = await getCurrentBranch(repoPath)
  if (currentBranch !== branch) {
    await checkoutBranch(repoPath, branch)
  }

  // Read all spec files from the branch
  const specFiles = await listSpecFiles(repoPath, branch, specsPath)
  if (specFiles.length === 0) {
    return []
  }

  const specContents: { path: string; content: string }[] = []
  for (const filePath of specFiles) {
    try {
      const content = await readFileFromBranch(repoPath, branch, filePath)
      specContents.push({ path: filePath, content })
    } catch {
      // Skip files that can't be read
    }
  }

  if (specContents.length === 0) {
    return []
  }

  const specsText = specContents
    .map((s) => `### ${s.path}\n\`\`\`markdown\n${s.content}\n\`\`\``)
    .join('\n\n')

  const tools: Tool[] = [createClaudeCodeTool(repoPath)]

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: `Audit the fulfillment status of the following specs against the current codebase.

## Spec Files
${specsText}

For each spec, use the claude_code tool to search the codebase for implementations matching the acceptance criteria. Then return your audit results as a JSON array.`,
    },
  ]

  const result = await runReactAgent(
    {
      systemPrompt: AUDITOR_SYSTEM_PROMPT,
      tools,
      model: 'claude-sonnet-4-6',
      maxSteps: 15,
    },
    messages,
    client,
  )

  const results = parseAuditResults(result.response)

  // Update spec files with fulfillment status
  for (const auditResult of results) {
    const specEntry = specContents.find((s) => {
      try {
        const parsed = parseSpec(s.path, s.content)
        return parsed.meta.id === auditResult.specId
      } catch {
        return false
      }
    })

    if (!specEntry) continue

    try {
      const parsed = parseSpec(specEntry.path, specEntry.content)
      parsed.meta.fulfillment = auditResult.fulfillment
      parsed.meta.fulfillment_explanation = auditResult.explanation
      parsed.meta.updated = new Date().toISOString().split('T')[0]!

      const updatedContent = writeSpec(parsed)
      const absPath = join(repoPath, specEntry.path)
      const dir = absPath.substring(0, absPath.lastIndexOf('/'))
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(absPath, updatedContent, 'utf-8')
    } catch {
      // Skip specs that can't be parsed/updated
    }
  }

  // Commit the updated specs
  try {
    await execGit(repoPath, ['add', specsPath])
    // Check if there are staged changes
    try {
      await execGit(repoPath, ['diff', '--cached', '--quiet'])
      // No changes to commit
    } catch {
      // diff --cached --quiet exits with 1 when there are staged changes
      await execGit(repoPath, ['commit', '-m', 'audit: update spec fulfillment status'])
    }
  } catch {
    // Commit failed, but we still return results
  }

  return results
}

function parseAuditResults(response: string): FulfillmentResult[] {
  // Try to extract JSON array from the response
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as FulfillmentResult[]
      if (Array.isArray(parsed)) {
        return parsed.map((r) => ({
          specId: String(r.specId ?? ''),
          fulfillment: validateFulfillment(r.fulfillment),
          explanation: String(r.explanation ?? ''),
        }))
      }
    } catch {
      // Fall through
    }
  }
  return []
}

function validateFulfillment(
  value: unknown,
): 'unfulfilled' | 'partial' | 'fulfilled' {
  if (value === 'fulfilled' || value === 'partial' || value === 'unfulfilled') {
    return value
  }
  return 'unfulfilled'
}
