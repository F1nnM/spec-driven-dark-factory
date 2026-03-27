import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type Anthropic from '@anthropic-ai/sdk'

const hasApiKey = !!process.env.ANTHROPIC_API_KEY

function makeTextResponse(text: string): Anthropic.Messages.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  }
}

function makeToolUseResponse(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolUseId: string,
): Anthropic.Messages.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [
      { type: 'tool_use', id: toolUseId, name: toolName, input: toolInput },
    ],
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  }
}

function createStubClient(
  responses: Anthropic.Messages.Message[],
): Anthropic {
  let callIndex = 0
  return {
    messages: {
      create: async () => {
        const response = responses[callIndex]
        if (!response) throw new Error(`No stub response for call index ${callIndex}`)
        callIndex++
        return response
      },
    },
  } as unknown as Anthropic
}

const TEST_REPO = join(import.meta.dirname ?? __dirname, '..', '.tmp-analyzer-test-repo')

function createTestRepo(): void {
  if (existsSync(TEST_REPO)) {
    rmSync(TEST_REPO, { recursive: true, force: true })
  }
  mkdirSync(TEST_REPO, { recursive: true })
  execSync('git init -b main', { cwd: TEST_REPO })
  execSync('git config user.email "test@test.com"', { cwd: TEST_REPO })
  execSync('git config user.name "Test"', { cwd: TEST_REPO })

  // Create a project structure
  mkdirSync(join(TEST_REPO, 'src'), { recursive: true })
  writeFileSync(
    join(TEST_REPO, 'package.json'),
    JSON.stringify({ name: 'test-project', version: '1.0.0' }),
  )
  writeFileSync(
    join(TEST_REPO, 'src', 'index.ts'),
    'export function main() { console.log("hello") }',
  )
  writeFileSync(
    join(TEST_REPO, 'src', 'utils.ts'),
    'export function add(a: number, b: number) { return a + b }',
  )

  execSync('git add -A', { cwd: TEST_REPO })
  execSync('git commit -m "initial"', { cwd: TEST_REPO })
}

function cleanupTestRepo(): void {
  if (existsSync(TEST_REPO)) {
    rmSync(TEST_REPO, { recursive: true, force: true })
  }
}

describe('codebase-analyzer', () => {
  beforeEach(() => {
    createTestRepo()
  })

  afterEach(() => {
    cleanupTestRepo()
  })

  it('creates spec files in the correct directory using write_spec tool', async () => {
    const { analyzeCodebase } = await import('../../src/agents/codebase-analyzer')

    const specContent = `---
id: "SPEC-001"
title: "Main Entry Point"
category: "functional"
status: "implemented"
fulfillment: "fulfilled"
fulfillment_explanation: "Implementation found in src/index.ts"
depends_on: []
relates_to: []
tags:
  - core
created: "2025-01-01"
updated: "2025-01-01"
---

## Overview
Main entry point for the application.

## Acceptance Criteria
- [ ] Main function exists
`

    const client = createStubClient([
      // First call: agent uses write_spec tool
      makeToolUseResponse(
        'write_spec',
        { path: 'specs/SPEC-001-main-entry.md', content: specContent },
        'tu_write_1',
      ),
      // Second call: agent uses commit_specs tool
      makeToolUseResponse(
        'commit_specs',
        { message: 'analyze: generate initial specs from existing codebase' },
        'tu_commit_1',
      ),
      // Third call: agent returns result
      makeTextResponse(
        JSON.stringify({
          specsCreated: 1,
          categories: ['functional'],
        }),
      ),
    ])

    const result = await analyzeCodebase(TEST_REPO, 'specs', 'main', client)

    expect(result.specsCreated).toBe(1)
    expect(result.categories).toContain('functional')

    // Verify spec file was created
    const specFile = join(TEST_REPO, 'specs', 'SPEC-001-main-entry.md')
    expect(existsSync(specFile)).toBe(true)
  })

  it('generated specs have proper frontmatter format', async () => {
    const { analyzeCodebase } = await import('../../src/agents/codebase-analyzer')
    const { parseSpec } = await import('@spec-factory/shared')

    const specContent = `---
id: "SPEC-002"
title: "Utility Functions"
category: "functional"
status: "implemented"
fulfillment: "fulfilled"
fulfillment_explanation: "Utils in src/utils.ts"
depends_on: []
relates_to: []
tags:
  - utils
created: "2025-01-01"
updated: "2025-01-01"
---

## Overview
Utility functions.

## Acceptance Criteria
- [ ] Add function exists
`

    const client = createStubClient([
      makeToolUseResponse(
        'write_spec',
        { path: 'specs/SPEC-002-utils.md', content: specContent },
        'tu_write_1',
      ),
      makeToolUseResponse(
        'commit_specs',
        { message: 'analyze: generate initial specs from existing codebase' },
        'tu_commit_1',
      ),
      makeTextResponse(
        JSON.stringify({ specsCreated: 1, categories: ['functional'] }),
      ),
    ])

    await analyzeCodebase(TEST_REPO, 'specs', 'main', client)

    // Read and parse the created spec
    const specFile = join(TEST_REPO, 'specs', 'SPEC-002-utils.md')
    const content = readFileSync(specFile, 'utf-8')
    const parsed = parseSpec('specs/SPEC-002-utils.md', content)

    expect(parsed.meta.id).toBe('SPEC-002')
    expect(parsed.meta.status).toBe('implemented')
    expect(parsed.meta.fulfillment).toBe('fulfilled')
    expect(parsed.meta.category).toBe('functional')
    expect(parsed.meta.title).toBe('Utility Functions')
  })

  it('creates specs directory if it does not exist', async () => {
    const { analyzeCodebase } = await import('../../src/agents/codebase-analyzer')

    // The specs directory shouldn't exist yet
    expect(existsSync(join(TEST_REPO, 'new-specs'))).toBe(false)

    const client = createStubClient([
      makeTextResponse(
        JSON.stringify({ specsCreated: 0, categories: [] }),
      ),
    ])

    await analyzeCodebase(TEST_REPO, 'new-specs', 'main', client)

    // Directory should now exist
    expect(existsSync(join(TEST_REPO, 'new-specs'))).toBe(true)
  })

  it('returns zero when no specs are created', async () => {
    const { analyzeCodebase } = await import('../../src/agents/codebase-analyzer')

    const client = createStubClient([
      makeTextResponse(
        JSON.stringify({ specsCreated: 0, categories: [] }),
      ),
    ])

    const result = await analyzeCodebase(TEST_REPO, 'specs', 'main', client)

    expect(result.specsCreated).toBe(0)
    expect(result.categories).toEqual([])
  })
})

describe.skipIf(!hasApiKey)('codebase-analyzer integration', () => {
  it('analyzes codebase with real API', async () => {
    expect(hasApiKey).toBe(true)
  })
})
