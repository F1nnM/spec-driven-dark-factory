const server = Bun.serve({
  port: 3001,
  fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' })
    }

    return new Response('Not Found', { status: 404 })
  },
})

console.log(`Agent service listening on http://localhost:${server.port}`)
