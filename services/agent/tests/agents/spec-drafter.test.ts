import { describe, expect, it } from 'vitest'

const hasApiKey = !!process.env.ANTHROPIC_API_KEY

describe.skipIf(!hasApiKey)('spec-drafter integration', () => {
  it('placeholder for integration test with real API', async () => {
    // This test requires ANTHROPIC_API_KEY to be set
    // When enabled, it would:
    // 1. Create a test git repo with spec files
    // 2. Run the spec drafter with a real API call
    // 3. Verify that spec files were created/modified
    //
    // Skipped by default since it requires API access and costs money.
    expect(hasApiKey).toBe(true)
  })
})
