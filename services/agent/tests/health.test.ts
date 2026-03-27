import { describe, expect, it } from 'vitest'
import { handleRequest } from '../src/index.js'

describe('agent health endpoint', () => {
  it('returns { status: ok } on /health', async () => {
    const req = new Request('http://localhost/health')
    const response = await handleRequest(req)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'ok' })
  })

  it('returns 404 for unknown routes', async () => {
    const req = new Request('http://localhost/unknown')
    const response = await handleRequest(req)
    expect(response.status).toBe(404)
  })
})
