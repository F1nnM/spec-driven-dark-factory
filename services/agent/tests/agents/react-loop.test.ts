import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { runReactAgent, type Tool, type AgentConfig } from '../../src/agents/react-loop'

// Minimal stub for Anthropic client that returns predefined responses
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

describe('runReactAgent', () => {
  it('returns text response when model ends turn immediately', async () => {
    const client = createStubClient([makeTextResponse('Hello!')])

    const result = await runReactAgent(
      { systemPrompt: 'You are helpful.', tools: [] },
      [{ role: 'user', content: 'Hi' }],
      client,
    )

    expect(result.response).toBe('Hello!')
    expect(result.messages).toHaveLength(2) // user + assistant
    expect(result.messages[1]!.role).toBe('assistant')
  })

  it('executes tools and passes results back to the model', async () => {
    const executeCalls: Record<string, unknown>[] = []

    const addTool: Tool = {
      name: 'add',
      description: 'Add two numbers',
      input_schema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      },
      async execute(input) {
        executeCalls.push(input)
        const a = input.a as number
        const b = input.b as number
        return String(a + b)
      },
    }

    const client = createStubClient([
      makeToolUseResponse('add', { a: 3, b: 4 }, 'tu_1'),
      makeTextResponse('The answer is 7.'),
    ])

    const result = await runReactAgent(
      { systemPrompt: 'You can add numbers.', tools: [addTool] },
      [{ role: 'user', content: 'What is 3 + 4?' }],
      client,
    )

    expect(result.response).toBe('The answer is 7.')
    expect(executeCalls).toHaveLength(1)
    expect(executeCalls[0]).toEqual({ a: 3, b: 4 })

    // Messages should be: user, assistant (tool_use), user (tool_result), assistant (text)
    expect(result.messages).toHaveLength(4)
  })

  it('handles tool execution errors gracefully', async () => {
    const failTool: Tool = {
      name: 'fail',
      description: 'Always fails',
      input_schema: { type: 'object', properties: {}, required: [] },
      async execute() {
        throw new Error('Something went wrong')
      },
    }

    const client = createStubClient([
      makeToolUseResponse('fail', {}, 'tu_err'),
      makeTextResponse('The tool failed, sorry.'),
    ])

    const result = await runReactAgent(
      { systemPrompt: 'Test', tools: [failTool] },
      [{ role: 'user', content: 'Do something' }],
      client,
    )

    expect(result.response).toBe('The tool failed, sorry.')

    // Check that the error was passed back as a tool result
    const toolResultMsg = result.messages[2]
    expect(toolResultMsg!.role).toBe('user')
    const content = toolResultMsg!.content as Anthropic.Messages.ToolResultBlockParam[]
    expect(content[0]!.is_error).toBe(true)
    expect(content[0]!.content).toContain('Something went wrong')
  })

  it('handles unknown tool names', async () => {
    const client = createStubClient([
      makeToolUseResponse('nonexistent', {}, 'tu_unknown'),
      makeTextResponse('I could not find that tool.'),
    ])

    const result = await runReactAgent(
      { systemPrompt: 'Test', tools: [] },
      [{ role: 'user', content: 'Use nonexistent tool' }],
      client,
    )

    expect(result.response).toBe('I could not find that tool.')
    const toolResultMsg = result.messages[2]
    const content = toolResultMsg!.content as Anthropic.Messages.ToolResultBlockParam[]
    expect(content[0]!.is_error).toBe(true)
    expect(content[0]!.content).toContain('Unknown tool')
  })

  it('stops after maxSteps and returns last text', async () => {
    const loopTool: Tool = {
      name: 'loop',
      description: 'Loop forever',
      input_schema: { type: 'object', properties: {}, required: [] },
      async execute() {
        return 'looped'
      },
    }

    // Always returns tool_use, never end_turn
    const infiniteResponses = Array.from({ length: 5 }, (_, i) =>
      makeToolUseResponse('loop', {}, `tu_loop_${i}`),
    )

    const client = createStubClient(infiniteResponses)

    const result = await runReactAgent(
      { systemPrompt: 'Test', tools: [loopTool], maxSteps: 3 },
      [{ role: 'user', content: 'Loop' }],
      client,
    )

    // Should have stopped after 3 steps
    expect(result.response).toBe('Max steps reached without completion.')
    // 1 user + 3*(assistant + user tool result) = 7 messages
    expect(result.messages).toHaveLength(7)
  })

  it('handles multiple tool uses in a single response', async () => {
    const results: string[] = []
    const multiTool: Tool = {
      name: 'echo',
      description: 'Echo input',
      input_schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      async execute(input) {
        const text = input.text as string
        results.push(text)
        return `echoed: ${text}`
      },
    }

    const multiToolResponse: Anthropic.Messages.Message = {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tu_a', name: 'echo', input: { text: 'hello' } },
        { type: 'tool_use', id: 'tu_b', name: 'echo', input: { text: 'world' } },
      ],
      model: 'claude-sonnet-4-6',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    }

    const client = createStubClient([
      multiToolResponse,
      makeTextResponse('Done echoing.'),
    ])

    const result = await runReactAgent(
      { systemPrompt: 'Test', tools: [multiTool] },
      [{ role: 'user', content: 'Echo hello and world' }],
      client,
    )

    expect(result.response).toBe('Done echoing.')
    expect(results).toEqual(['hello', 'world'])

    // Tool results should have both results
    const toolResultMsg = result.messages[2]
    const content = toolResultMsg!.content as Anthropic.Messages.ToolResultBlockParam[]
    expect(content).toHaveLength(2)
    expect(content[0]!.content).toBe('echoed: hello')
    expect(content[1]!.content).toBe('echoed: world')
  })
})
