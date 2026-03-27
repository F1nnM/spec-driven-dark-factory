import { handleClone, handleStatus } from './api/projects.js'
import { handleGetSpecs } from './api/specs.js'
import { handleDraft } from './api/drafter.js'
import { handlePlan, handleApprove } from './api/evolution.js'

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

  const specsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/specs$/)
  if (specsMatch && req.method === 'GET') {
    return handleGetSpecs(req, specsMatch[1]!)
  }

  const draftMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/draft$/)
  if (draftMatch && req.method === 'POST') {
    return handleDraft(req, draftMatch[1]!)
  }

  const planMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/plan$/)
  if (planMatch && req.method === 'POST') {
    return handlePlan(req, planMatch[1]!)
  }

  const approveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/approve$/)
  if (approveMatch && req.method === 'POST') {
    return handleApprove(req, approveMatch[1]!)
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
