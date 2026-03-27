import { describe, expect, it } from 'vitest'
import type { EvolutionStep, Revision, SpecFile, SpecMeta } from '../src/index.js'

describe('shared types', () => {
  it('SpecFile has expected shape', () => {
    const meta: SpecMeta = {
      id: 'SPEC-001',
      title: 'User Authentication',
      category: 'security',
      status: 'approved',
      fulfillment: 'partial',
      fulfillment_explanation: 'OAuth implemented, session expiry pending',
      depends_on: ['SPEC-003'],
      relates_to: ['SPEC-005'],
      tags: ['auth', 'oauth'],
      created: '2026-03-26',
      updated: '2026-03-26',
    }
    const specFile: SpecFile = {
      path: '/specs/SPEC-001-user-auth.md',
      meta,
      body: '## Overview\nThe system shall authenticate users via OAuth 2.0.',
    }
    expect(specFile.path).toBe('/specs/SPEC-001-user-auth.md')
    expect(specFile.meta.id).toBe('SPEC-001')
    expect(specFile.meta.fulfillment).toBe('partial')
    expect(specFile.meta.depends_on).toEqual(['SPEC-003'])
    expect(specFile.body).toContain('OAuth 2.0')
  })

  it('Revision has expected shape', () => {
    const revision: Revision = {
      id: 'rev-1',
      projectId: 'proj-1',
      revisionNumber: 1,
      status: 'drafting',
      branchName: 'revision-1',
      createdAt: new Date('2026-01-01'),
      completedAt: null,
    }
    expect(revision.id).toBe('rev-1')
    expect(revision.status).toBe('drafting')
    expect(revision.completedAt).toBeNull()
    expect(['drafting', 'approved', 'implementing', 'completed', 'interrupted']).toContain(revision.status)
  })

  it('EvolutionStep has expected shape', () => {
    const step: EvolutionStep = {
      id: 'step-1',
      revisionId: 'rev-1',
      stepNumber: 1,
      status: 'pending',
      branchName: 'revision-1/step-1',
      specCommitHash: 'abc123',
      reviewLoopCount: 0,
      reviewSummary: null,
    }
    expect(step.id).toBe('step-1')
    expect(step.revisionId).toBe('rev-1')
    expect(step.status).toBe('pending')
    expect(['pending', 'implementing', 'reviewing', 'completed', 'failed']).toContain(step.status)
  })
})
