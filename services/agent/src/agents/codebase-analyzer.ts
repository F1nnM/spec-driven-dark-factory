import { runReactAgent, type Tool } from './react-loop.js'
import { createClaudeCodeTool } from '../tools/claude-code-tool.js'
import { execGit, checkoutBranch, getCurrentBranch } from '../git/operations.js'
import { parseSpecSafe } from '@spec-factory/shared'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createGitSpecTools } from '../tools/git-spec-tools.js'
import type Anthropic from '@anthropic-ai/sdk'

export interface AnalyzerResult {
  specsCreated: number
  categories: string[]
}

const ANALYZER_SYSTEM_PROMPT = `You are a Codebase Analyzer agent for a spec-driven development platform. Your job is to explore an existing codebase and generate spec files that document what already exists.

## Your Process
1. Use the claude_code tool to explore the project structure, README, package.json, main entry points
2. Identify key features, architecture decisions, testing patterns, dependencies
3. Generate appropriate categories: functional, non-functional, architecture, testing, infrastructure, etc.
4. Create one spec per feature/concern using the write_spec tool
5. Use the commit_specs tool to commit all specs when done

## Spec File Format
Each spec must be a markdown file with YAML frontmatter. Example:

\`\`\`markdown
---
id: "SPEC-001"
title: "User Authentication"
category: "functional"
status: "implemented"
fulfillment: "fulfilled"
fulfillment_explanation: "Implementation found in src/auth/ with full test coverage"
depends_on: []
relates_to: []
tags:
  - auth
  - security
created: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
---

## Overview
Brief description of the feature.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
\`\`\`

## Rules
- Use SPEC-NNN format for IDs (SPEC-001, SPEC-002, etc.), zero-padded to 3 digits
- All specs must have status: "implemented" and fulfillment: "fulfilled" since the code already exists
- Include a fulfillment_explanation describing where the implementation lives
- Use today's date for created and updated fields
- The spec file path should be: {specsPath}/SPEC-NNN-short-slug.md
- Be thorough: cover architecture, main features, testing, build system, etc.
- Keep specs focused — one concern per spec
- Use the write_spec tool to create each spec file
- Use the commit_specs tool at the end to commit all specs

## Output
After creating and committing all specs, return a JSON object (and nothing else):
{
  "specsCreated": <number>,
  "categories": ["category1", "category2", ...]
}`

export async function analyzeCodebase(
  repoPath: string,
  specsPath: string,
  branch?: string,
  client?: Anthropic,
): Promise<AnalyzerResult> {
  const targetBranch = branch ?? 'main'

  // Ensure we're on the right branch
  const currentBranch = await getCurrentBranch(repoPath)
  if (currentBranch !== targetBranch) {
    await checkoutBranch(repoPath, targetBranch)
  }

  // Ensure specs directory exists
  const fullSpecsPath = join(repoPath, specsPath)
  if (!existsSync(fullSpecsPath)) {
    mkdirSync(fullSpecsPath, { recursive: true })
  }

  const today = new Date().toISOString().split('T')[0]

  const tools: Tool[] = [
    createClaudeCodeTool(repoPath),
    ...createGitSpecTools(repoPath, targetBranch, specsPath),
  ]

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: `Analyze this codebase and generate spec files documenting what already exists.

The specs directory is: ${specsPath}
Today's date is: ${today}

1. First, use claude_code to explore the project structure, README, configuration files, and main source code
2. Identify all key features, architecture patterns, and concerns
3. Create spec files using the write_spec tool for each identified aspect
4. Commit the specs using commit_specs with message "analyze: generate initial specs from existing codebase"
5. Return the results as JSON`,
    },
  ]

  const result = await runReactAgent(
    {
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      tools,
      model: 'claude-sonnet-4-6',
      maxSteps: 25,
    },
    messages,
    client,
  )

  const parsed = parseAnalyzerResult(result.response)

  // If the agent didn't return good counts, count specs from the directory
  if (parsed.specsCreated === 0) {
    try {
      const treeOutput = await execGit(repoPath, [
        'ls-tree',
        '-r',
        '--name-only',
        'HEAD',
        specsPath,
      ])
      if (treeOutput.trim()) {
        const files = treeOutput.split('\n').filter((f) => f.endsWith('.md'))
        parsed.specsCreated = files.length

        // Extract categories from committed specs
        const categories = new Set<string>()
        for (const file of files) {
          try {
            const content = await execGit(repoPath, ['show', `HEAD:${file}`])
            const spec = parseSpecSafe(file, content)
            if (spec) {
              categories.add(spec.meta.category)
            }
          } catch {
            // Skip
          }
        }
        if (categories.size > 0) {
          parsed.categories = [...categories].sort()
        }
      }
    } catch {
      // Could not count specs
    }
  }

  return parsed
}

function parseAnalyzerResult(response: string): AnalyzerResult {
  const jsonMatch = response.match(/\{[\s\S]*"specsCreated"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as AnalyzerResult
      return {
        specsCreated: Number(parsed.specsCreated ?? 0),
        categories: Array.isArray(parsed.categories)
          ? parsed.categories.map(String)
          : [],
      }
    } catch {
      // Fall through
    }
  }
  return { specsCreated: 0, categories: [] }
}
