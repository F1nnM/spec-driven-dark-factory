import { spawn } from 'node:child_process'
import type { Tool } from '../agents/react-loop.js'

export function createClaudeCodeTool(workDir: string): Tool {
  return {
    name: 'claude_code',
    description:
      'Execute a coding task using Claude Code CLI. Provide a detailed prompt describing what code to write, test, or modify. The tool runs Claude Code in the given working directory with full file system access.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'Detailed instructions for what to implement' },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 300000)',
        },
      },
      required: ['prompt'],
    },
    async execute(input: Record<string, unknown>): Promise<string> {
      const { prompt, timeout_ms = 300_000 } = input as {
        prompt: string
        timeout_ms?: number
      }

      return runClaudeCode(workDir, prompt, timeout_ms)
    },
  }
}

export function runClaudeCode(
  workDir: string,
  prompt: string,
  timeoutMs: number = 300_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '--bare',
      '--dangerously-skip-permissions',
      '-p',
      prompt,
      '--cwd',
      workDir,
    ]

    const proc = spawn('claude', args, {
      cwd: workDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    const timer = setTimeout(() => {
      killed = true
      proc.kill('SIGTERM')
      // Give it a moment to exit gracefully, then force kill
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL')
        }
      }, 5_000)
    }, timeoutMs)

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (killed) {
        reject(new Error(`Claude Code timed out after ${timeoutMs}ms. Partial output:\n${stdout}`))
        return
      }
      if (code !== 0) {
        reject(
          new Error(
            `Claude Code exited with code ${code}.\nStderr: ${stderr.trim()}\nStdout: ${stdout.trim()}`,
          ),
        )
        return
      }
      resolve(stdout)
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`))
    })
  })
}
