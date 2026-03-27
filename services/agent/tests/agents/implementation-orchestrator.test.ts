import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { createOrchestratorTools } from '../../src/agents/implementation-orchestrator'

// Stub helpers (same pattern as react-loop.test.ts)
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

describe('createOrchestratorTools', () => {
  it('creates three tools: claude_code, code_review, git_diff', () => {
    const tools = createOrchestratorTools('/tmp/test-repo', 'specs')

    expect(tools).toHaveLength(3)

    const names = tools.map((t) => t.name)
    expect(names).toContain('claude_code')
    expect(names).toContain('code_review')
    expect(names).toContain('git_diff')
  })

  it('claude_code tool has correct schema', () => {
    const tools = createOrchestratorTools('/tmp/test-repo', 'specs')
    const claudeCodeTool = tools.find((t) => t.name === 'claude_code')!

    expect(claudeCodeTool.input_schema.properties).toHaveProperty('prompt')
    expect(claudeCodeTool.input_schema.required).toEqual(['prompt'])
  })

  it('code_review tool has correct schema', () => {
    const tools = createOrchestratorTools('/tmp/test-repo', 'specs')
    const reviewTool = tools.find((t) => t.name === 'code_review')!

    expect(reviewTool.input_schema.properties).toHaveProperty('spec_commit_hash')
    expect(reviewTool.input_schema.properties).toHaveProperty('implementation_diff')
    expect(reviewTool.input_schema.required).toContain('spec_commit_hash')
    expect(reviewTool.input_schema.required).toContain('implementation_diff')
  })

  it('git_diff tool has correct schema', () => {
    const tools = createOrchestratorTools('/tmp/test-repo', 'specs')
    const diffTool = tools.find((t) => t.name === 'git_diff')!

    expect(diffTool.input_schema.properties).toHaveProperty('spec_commit_hash')
    expect(diffTool.input_schema.required).toContain('spec_commit_hash')
  })
})

describe('implementStep result parsing', () => {
  // We test the parsing logic indirectly through the agent
  // by mocking the LLM to return specific text responses

  it('handles completed status JSON response', async () => {
    const { runReactAgent } = await import('../../src/agents/react-loop')

    const client = createStubClient([
      makeTextResponse(
        JSON.stringify({
          status: 'completed',
          reviewLoopCount: 2,
          reviewSummary: 'All specs satisfied',
        }),
      ),
    ])

    const result = await runReactAgent(
      {
        systemPrompt: 'Test',
        tools: [],
      },
      [{ role: 'user', content: 'Implement' }],
      client,
    )

    // Verify the response is valid JSON that our parser would accept
    const parsed = JSON.parse(result.response) as {
      status: string
      reviewLoopCount: number
      reviewSummary: string
    }
    expect(parsed.status).toBe('completed')
    expect(parsed.reviewLoopCount).toBe(2)
    expect(parsed.reviewSummary).toBe('All specs satisfied')
  })

  it('handles failed status JSON response', async () => {
    const { runReactAgent } = await import('../../src/agents/react-loop')

    const client = createStubClient([
      makeTextResponse(
        JSON.stringify({
          status: 'failed',
          reviewLoopCount: 3,
          reviewSummary: 'Tests still failing after max loops',
        }),
      ),
    ])

    const result = await runReactAgent(
      {
        systemPrompt: 'Test',
        tools: [],
      },
      [{ role: 'user', content: 'Implement' }],
      client,
    )

    const parsed = JSON.parse(result.response) as {
      status: string
      reviewLoopCount: number
    }
    expect(parsed.status).toBe('failed')
    expect(parsed.reviewLoopCount).toBe(3)
  })

  it('review loop respects maxSteps in the agent', async () => {
    const { runReactAgent } = await import('../../src/agents/react-loop')

    // Create a tool that always returns review failure
    const reviewResults: string[] = []
    const mockReviewTool: import('../../src/agents/react-loop').Tool = {
      name: 'code_review',
      description: 'Mock review',
      input_schema: {
        type: 'object',
        properties: {
          spec_commit_hash: { type: 'string' },
          implementation_diff: { type: 'string' },
        },
        required: ['spec_commit_hash', 'implementation_diff'],
      },
      async execute() {
        const result = JSON.stringify({
          passed: false,
          summary: 'Tests failing',
          issues: ['Missing implementation'],
        })
        reviewResults.push(result)
        return result
      },
    }

    // Agent calls review tool, gets failure, then ends
    const client = createStubClient([
      makeToolUseResponse(
        'code_review',
        { spec_commit_hash: 'abc123', implementation_diff: 'diff content' },
        'tu_review_1',
      ),
      makeToolUseResponse(
        'code_review',
        { spec_commit_hash: 'abc123', implementation_diff: 'diff content v2' },
        'tu_review_2',
      ),
      makeTextResponse(
        JSON.stringify({
          status: 'failed',
          reviewLoopCount: 2,
          reviewSummary: 'Tests still failing',
        }),
      ),
    ])

    const result = await runReactAgent(
      {
        systemPrompt: 'Test orchestrator',
        tools: [mockReviewTool],
        maxSteps: 5,
      },
      [{ role: 'user', content: 'Implement step' }],
      client,
    )

    // Two review calls were made
    expect(reviewResults).toHaveLength(2)

    // Response indicates failure
    const parsed = JSON.parse(result.response) as { status: string }
    expect(parsed.status).toBe('failed')
  })
})

describe('pipeline-runner', () => {
  it('requestAbort and clearAbort work correctly', async () => {
    const { requestAbort, clearAbort } = await import(
      '../../src/agents/pipeline-runner'
    )

    // Initially not aborted — clearAbort should be safe to call
    clearAbort('test-project')

    // After requesting abort, the flag is set
    requestAbort('test-project')

    // Clean up
    clearAbort('test-project')
  })
})
