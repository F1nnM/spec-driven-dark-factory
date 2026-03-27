import type { Tool } from '../agents/react-loop.js'
import { reviewCode, type ReviewResult } from '../agents/code-reviewer.js'

export function createReviewTool(repoPath: string, specsPath: string): Tool {
  return {
    name: 'code_review',
    description:
      'Submit the current implementation for code review against specs. Provide the spec commit hash and the implementation diff. Returns a JSON object with passed (boolean), summary (string), and issues (string array).',
    input_schema: {
      type: 'object' as const,
      properties: {
        spec_commit_hash: {
          type: 'string',
          description: 'The git commit hash containing the spec changes for this step',
        },
        implementation_diff: {
          type: 'string',
          description: 'The git diff of the implementation changes to review',
        },
      },
      required: ['spec_commit_hash', 'implementation_diff'],
    },
    async execute(input: Record<string, unknown>): Promise<string> {
      const specCommitHash = input.spec_commit_hash as string
      const implementationDiff = input.implementation_diff as string

      const result: ReviewResult = await reviewCode(
        repoPath,
        specCommitHash,
        implementationDiff,
        specsPath,
      )

      return JSON.stringify(result)
    },
  }
}
