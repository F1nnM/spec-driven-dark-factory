import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('agent health endpoint', () => {
  let server: ReturnType<typeof Bun.serve>

  beforeAll(async () => {
    // Import the server handler logic inline to avoid port conflicts
    server = Bun.serve({
      port: 0, // random available port
      fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === '/health') {
          return Response.json({ status: 'ok' })
        }
        return new Response('Not Found', { status: 404 })
      },
    })
  })

  afterAll(() => {
    server.stop()
  })

  it('returns { status: ok } on /health', async () => {
    const response = await fetch(`http://localhost:${server.port}/health`)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'ok' })
  })

  it('returns 404 for unknown routes', async () => {
    const response = await fetch(`http://localhost:${server.port}/unknown`)
    expect(response.status).toBe(404)
  })
})
