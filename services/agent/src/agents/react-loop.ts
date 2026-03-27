import Anthropic from '@anthropic-ai/sdk'

export interface Tool {
  name: string
  description: string
  input_schema: Record<string, unknown>
  execute: (input: Record<string, unknown>) => Promise<string>
}

export interface AgentConfig {
  systemPrompt: string
  tools: Tool[]
  model?: string
  maxSteps?: number
}

export interface AgentResult {
  response: string
  messages: Anthropic.Messages.MessageParam[]
}

function toApiTools(tools: Tool[]): Anthropic.Messages.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Messages.Tool['input_schema'],
  }))
}

export async function runReactAgent(
  config: AgentConfig,
  messages: Anthropic.Messages.MessageParam[],
  client?: Anthropic,
): Promise<AgentResult> {
  const anthropic = client ?? new Anthropic()
  const model = config.model ?? 'claude-sonnet-4-6'
  const maxSteps = config.maxSteps ?? 20
  const apiTools = toApiTools(config.tools)
  const toolMap = new Map(config.tools.map((t) => [t.name, t]))

  const conversationMessages = [...messages]

  for (let step = 0; step < maxSteps; step++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 8192,
      system: config.systemPrompt,
      tools: apiTools,
      messages: conversationMessages,
    })

    // Add assistant message to conversation
    conversationMessages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter(
        (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
      )
      const responseText = textBlocks.map((b) => b.text).join('\n')
      return { response: responseText, messages: conversationMessages }
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      )

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        const tool = toolMap.get(toolUse.name)
        if (!tool) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error: Unknown tool "${toolUse.name}"`,
            is_error: true,
          })
          continue
        }

        try {
          const result = await tool.execute(toolUse.input as Record<string, unknown>)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          })
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error: ${errMsg}`,
            is_error: true,
          })
        }
      }

      conversationMessages.push({ role: 'user', content: toolResults })
    }
  }

  // Max steps reached — return whatever text we have from the last assistant message
  const lastAssistant = conversationMessages
    .filter((m) => m.role === 'assistant')
    .pop()

  let responseText = 'Max steps reached without completion.'
  if (lastAssistant && Array.isArray(lastAssistant.content)) {
    const textBlocks = (lastAssistant.content as Anthropic.Messages.ContentBlock[]).filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    )
    if (textBlocks.length > 0) {
      responseText = textBlocks.map((b) => b.text).join('\n')
    }
  }

  return { response: responseText, messages: conversationMessages }
}
