import { handleClone, handleStatus } from './api/projects.js'

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)

  if (url.pathname === '/health') {
    return Response.json({ status: 'ok' })
  }

  if (url.pathname === '/api/projects/clone' && req.method === 'POST') {
    return handleClone(req)
  }

  const statusMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/status$/)
  if (statusMatch && req.method === 'GET') {
    return handleStatus(req, statusMatch[1]!)
  }

  return new Response('Not Found', { status: 404 })
}

// Only start server when run directly (not imported by tests)
if (typeof Bun !== 'undefined') {
  const server = Bun.serve({
    port: 3001,
    fetch: handleRequest,
  })
  console.log(`Agent service listening on http://localhost:${server.port}`)
}
