import { describe, expect, it } from 'vitest'

// Provide Nuxt's auto-imported defineEventHandler before importing the module
;(globalThis as Record<string, unknown>).defineEventHandler = (handler: Function) => handler

describe('health endpoint', () => {
  it('returns { status: ok }', async () => {
    const mod = await import('../server/api/health.get.js')
    const handler = mod.default as () => { status: string }
    const result = handler()
    expect(result).toEqual({ status: 'ok' })
  })
})
