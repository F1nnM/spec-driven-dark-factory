import { describe, expect, it } from 'vitest'

describe('useGraphqlSubscription', () => {
  it('composable module exports expected function', async () => {
    // Verify the module has the correct structure
    // We test the setup logic without actual WebSocket by checking exports
    const mod = await import('../../app/composables/useGraphqlSubscription')
    expect(mod.useGraphqlSubscription).toBeDefined()
    expect(typeof mod.useGraphqlSubscription).toBe('function')
  })

  it('creates a subscription function that accepts query and variables', async () => {
    const { useGraphqlSubscription } = await import('../../app/composables/useGraphqlSubscription')

    // The function signature accepts a query string and variables
    expect(useGraphqlSubscription.length).toBeGreaterThanOrEqual(2)
  })
})
