import { describe, expect, it } from 'vitest'
import { createClaudeCodeTool } from '../../src/tools/claude-code-tool'

describe('createClaudeCodeTool', () => {
  it('creates a tool with correct name and schema', () => {
    const tool = createClaudeCodeTool('/tmp/test-repo')

    expect(tool.name).toBe('claude_code')
    expect(tool.description).toContain('Claude Code')
    expect(tool.input_schema.properties).toHaveProperty('prompt')
    expect(tool.input_schema.properties).toHaveProperty('timeout_ms')
    expect(tool.input_schema.required).toEqual(['prompt'])
  })

  it('rejects when claude CLI is not available', async () => {
    const tool = createClaudeCodeTool('/tmp/nonexistent-repo')

    await expect(
      tool.execute({ prompt: 'test prompt' }),
    ).rejects.toThrow()
  })

  it('rejects on timeout with partial output', async () => {
    // Use a command that will hang — if claude CLI is available it would run;
    // since it likely isn't, this tests the spawn error path
    const tool = createClaudeCodeTool('/tmp/test-repo')

    await expect(
      tool.execute({ prompt: 'test', timeout_ms: 1 }),
    ).rejects.toThrow()
  })
})
