import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type Anthropic from '@anthropic-ai/sdk'

const hasApiKey = !!process.env.ANTHROPIC_API_KEY

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

function makeToolUseResponse(toolName: string, toolId: string, input: Record<string, unknown>): Anthropic.Messages.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: toolId,
        name: toolName,
        input,
      },
    ],
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  }
}

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

const TEST_REPO = join(import.meta.dirname ?? __dirname, '..', '.tmp-restructurer-test-repo')

function createTestRepo(): void {
  if (existsSync(TEST_REPO)) {
    rmSync(TEST_REPO, { recursive: true, force: true })
  }
  mkdirSync(TEST_REPO, { recursive: true })
  execSync('git init -b main', { cwd: TEST_REPO })
  execSync('git config user.email "test@test.com"', { cwd: TEST_REPO })
  execSync('git config user.name "Test"', { cwd: TEST_REPO })

  // Create spec files
  mkdirSync(join(TEST_REPO, 'specs'), { recursive: true })
  writeFileSync(
    join(TEST_REPO, 'specs', 'SPEC-001-auth.md'),
    `---
id: "SPEC-001"
title: "Authentication"
category: "functional"
status: "implemented"
fulfillment: "fulfilled"
fulfillment_explanation: "Implemented"
depends_on: []
relates_to: []
tags:
  - auth
created: "2025-01-01"
updated: "2025-01-01"
---

## Overview
User authentication feature.

## Acceptance Criteria
- Login function exists
- Returns boolean
`,
  )

  writeFileSync(
    join(TEST_REPO, 'specs', 'SPEC-002-api.md'),
    `---
id: "SPEC-002"
title: "API Endpoints"
category: "functional"
status: "implemented"
fulfillment: "partial"
fulfillment_explanation: "Some endpoints exist"
depends_on:
  - "SPEC-001"
relates_to: []
tags:
  - api
created: "2025-01-01"
updated: "2025-01-01"
---

## Overview
REST API endpoints.

## Acceptance Criteria
- GET /users endpoint
- POST /users endpoint
`,
  )

  execSync('git add -A', { cwd: TEST_REPO })
  execSync('git commit -m "initial"', { cwd: TEST_REPO })
}

function cleanupTestRepo(): void {
  if (existsSync(TEST_REPO)) {
    rmSync(TEST_REPO, { recursive: true, force: true })
  }
}

describe('spec-restructurer', () => {
  beforeEach(() => {
    createTestRepo()
  })

  afterEach(() => {
    cleanupTestRepo()
  })

  it('returns score between 0-100 with stub client', async () => {
    const { evaluateRestructuring } = await import('../../src/agents/spec-restructurer')

    const client = createStubClient([
      // First call: read_all_specs tool use
      makeToolUseResponse('read_all_specs', 'tool_1', {}),
      // Second call: final text response with JSON
      makeTextResponse(JSON.stringify({
        score: 25,
        reasoning: 'Specs are well-organized with proper categories and relations. Minor improvements could be made to granularity.',
      })),
    ])

    const result = await evaluateRestructuring(TEST_REPO, 'main', 'specs', client)

    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.score).toBe(25)
  })

  it('returns non-empty reasoning with stub client', async () => {
    const { evaluateRestructuring } = await import('../../src/agents/spec-restructurer')

    const client = createStubClient([
      makeToolUseResponse('read_all_specs', 'tool_1', {}),
      makeTextResponse(JSON.stringify({
        score: 55,
        reasoning: 'The spec graph has some issues: categories could be more specific and some relations are missing between SPEC-001 and SPEC-002.',
      })),
    ])

    const result = await evaluateRestructuring(TEST_REPO, 'main', 'specs', client)

    expect(result.reasoning).toBeTruthy()
    expect(result.reasoning.length).toBeGreaterThan(0)
    expect(result.reasoning).toContain('categories')
  })

  it('clamps score to valid range', async () => {
    const { evaluateRestructuring } = await import('../../src/agents/spec-restructurer')

    const client = createStubClient([
      makeTextResponse(JSON.stringify({
        score: 150,
        reasoning: 'Score out of range test.',
      })),
    ])

    const result = await evaluateRestructuring(TEST_REPO, 'main', 'specs', client)

    expect(result.score).toBe(100) // Clamped to max
  })

  it('handles unparseable response gracefully', async () => {
    const { evaluateRestructuring } = await import('../../src/agents/spec-restructurer')

    const client = createStubClient([
      makeTextResponse('I could not analyze the specs because of an error.'),
    ])

    const result = await evaluateRestructuring(TEST_REPO, 'main', 'specs', client)

    // Should return default values
    expect(result.score).toBe(50)
    expect(result.reasoning).toBeTruthy()
  })
})

describe.skipIf(!hasApiKey)('spec-restructurer integration', () => {
  it('evaluates specs with real API', async () => {
    expect(hasApiKey).toBe(true)
  })
})
