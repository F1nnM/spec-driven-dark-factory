import { Hono } from 'hono'
import { handleClone, handleStatus } from './api/projects.js'
import { handleGetSpecs } from './api/specs.js'
import { handleDraft } from './api/drafter.js'
import { handlePlan, handleApprove } from './api/evolution.js'
import { handleImplement } from './api/pipeline.js'
import { handleAudit } from './api/fulfillment.js'
import { handleAnalyze } from './api/analyzer.js'
import { handleInterrupt } from './api/interrupt.js'
import { handleRestructureEvaluate, handleRestructureExecute } from './api/restructure.js'

const app = new Hono()

// Health
app.get('/health', (c) => c.json({ status: 'ok' }))

// Projects
app.post('/api/projects/clone', async (c) => {
  return handleClone(c.req.raw)
})
app.get('/api/projects/:projectId/status', async (c) => {
  return handleStatus(c.req.raw, c.req.param('projectId'))
})

// Specs
app.get('/api/projects/:projectId/specs', async (c) => {
  return handleGetSpecs(c.req.raw, c.req.param('projectId'))
})

// Drafter
app.post('/api/projects/:projectId/draft', async (c) => {
  return handleDraft(c.req.raw, c.req.param('projectId'))
})

// Evolution
app.post('/api/projects/:projectId/plan', async (c) => {
  return handlePlan(c.req.raw, c.req.param('projectId'))
})
app.post('/api/projects/:projectId/approve', async (c) => {
  return handleApprove(c.req.raw, c.req.param('projectId'))
})

// Pipeline
app.post('/api/projects/:projectId/implement', async (c) => {
  return handleImplement(c.req.raw, c.req.param('projectId'))
})

// Fulfillment
app.post('/api/projects/:projectId/audit', async (c) => {
  return handleAudit(c.req.raw, c.req.param('projectId'))
})

// Analyzer
app.post('/api/projects/:projectId/analyze', async (c) => {
  return handleAnalyze(c.req.raw, c.req.param('projectId'))
})

// Restructure
app.post('/api/projects/:projectId/restructure/evaluate', async (c) => {
  return handleRestructureEvaluate(c.req.raw, c.req.param('projectId'))
})
app.post('/api/projects/:projectId/restructure/execute', async (c) => {
  return handleRestructureExecute(c.req.raw, c.req.param('projectId'))
})

// Interrupt
app.post('/api/projects/:projectId/interrupt', async (c) => {
  return handleInterrupt(c.req.raw, c.req.param('projectId'))
})

export default app
export const handleRequest = app.fetch

// Only start server when run directly (not imported by tests)
if (typeof Bun !== 'undefined') {
  const server = Bun.serve({
    port: 3001,
    fetch: app.fetch,
  })
  console.log(`Agent service listening on http://localhost:${server.port}`)
}
