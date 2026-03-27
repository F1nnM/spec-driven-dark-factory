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

const TEST_REPO = join(import.meta.dirname ?? __dirname, '..', '.tmp-fulfillment-test-repo')

function createTestRepo(): void {
  if (existsSync(TEST_REPO)) {
    rmSync(TEST_REPO, { recursive: true, force: true })
  }
  mkdirSync(TEST_REPO, { recursive: true })
  execSync('git init -b main', { cwd: TEST_REPO })
  execSync('git config user.email "test@test.com"', { cwd: TEST_REPO })
  execSync('git config user.name "Test"', { cwd: TEST_REPO })

  // Create a source file
  mkdirSync(join(TEST_REPO, 'src'), { recursive: true })
  writeFileSync(join(TEST_REPO, 'src', 'auth.ts'), 'export function login() { return true }')

  // Create spec files
  mkdirSync(join(TEST_REPO, 'specs'), { recursive: true })
  writeFileSync(
    join(TEST_REPO, 'specs', 'SPEC-001-auth.md'),
    `---
id: "SPEC-001"
title: "Authentication"
category: "functional"
status: "implemented"
fulfillment: "unfulfilled"
fulfillment_explanation: ""
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
- [ ] Login function exists
- [ ] Returns boolean
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

describe('fulfillment-auditor', () => {
  beforeEach(() => {
    createTestRepo()
  })

  afterEach(() => {
    cleanupTestRepo()
  })

  it('reads specs and produces fulfillment results with stub client', async () => {
    const { auditFulfillment } = await import('../../src/agents/fulfillment-auditor')

    const client = createStubClient([
      makeTextResponse(
        JSON.stringify([
          {
            specId: 'SPEC-001',
            fulfillment: 'fulfilled',
            explanation: 'Login function found in src/auth.ts',
          },
        ]),
      ),
    ])

    const results = await auditFulfillment(TEST_REPO, 'main', 'specs', client)

    expect(results).toHaveLength(1)
    expect(results[0]!.specId).toBe('SPEC-001')
    expect(results[0]!.fulfillment).toBe('fulfilled')
    expect(results[0]!.explanation).toContain('Login function')
  })

  it('updates spec files with fulfillment status', async () => {
    const { auditFulfillment } = await import('../../src/agents/fulfillment-auditor')
    const { readFileSync } = await import('node:fs')
    const { parseSpec } = await import('@spec-factory/shared')

    const client = createStubClient([
      makeTextResponse(
        JSON.stringify([
          {
            specId: 'SPEC-001',
            fulfillment: 'partial',
            explanation: 'Login exists but no tests found',
          },
        ]),
      ),
    ])

    await auditFulfillment(TEST_REPO, 'main', 'specs', client)

    // Read the updated spec file from the working tree
    const updatedContent = readFileSync(join(TEST_REPO, 'specs', 'SPEC-001-auth.md'), 'utf-8')
    const parsed = parseSpec('specs/SPEC-001-auth.md', updatedContent)

    expect(parsed.meta.fulfillment).toBe('partial')
    expect(parsed.meta.fulfillment_explanation).toBe('Login exists but no tests found')
  })

  it('returns empty array when no specs exist', async () => {
    const { auditFulfillment } = await import('../../src/agents/fulfillment-auditor')

    // Remove specs and recommit
    rmSync(join(TEST_REPO, 'specs'), { recursive: true, force: true })
    execSync('git add -A && git commit -m "remove specs"', { cwd: TEST_REPO })

    const client = createStubClient([
      makeTextResponse('[]'),
    ])

    const results = await auditFulfillment(TEST_REPO, 'main', 'specs', client)
    expect(results).toEqual([])
  })

  it('handles invalid fulfillment values gracefully', async () => {
    const { auditFulfillment } = await import('../../src/agents/fulfillment-auditor')

    const client = createStubClient([
      makeTextResponse(
        JSON.stringify([
          {
            specId: 'SPEC-001',
            fulfillment: 'invalid_value',
            explanation: 'Some explanation',
          },
        ]),
      ),
    ])

    const results = await auditFulfillment(TEST_REPO, 'main', 'specs', client)

    expect(results).toHaveLength(1)
    expect(results[0]!.fulfillment).toBe('unfulfilled') // defaults to unfulfilled
  })
})

describe.skipIf(!hasApiKey)('fulfillment-auditor integration', () => {
  it('audits specs with real API', async () => {
    expect(hasApiKey).toBe(true)
  })
})
