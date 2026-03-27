import { describe, expect, it } from 'vitest'
import { diffSpecs, type SpecChange } from '../../src/specs/diff.js'
import type { SpecFile } from '../../src/types.js'

function makeSpec(overrides: Partial<SpecFile> & { meta: Partial<SpecFile['meta']> & { id: string } }): SpecFile {
  return {
    path: overrides.path ?? `/specs/${overrides.meta.id}.md`,
    meta: {
      title: 'Test Spec',
      category: 'general',
      status: 'draft',
      fulfillment: 'unfulfilled',
      fulfillment_explanation: '',
      depends_on: [],
      relates_to: [],
      tags: [],
      created: '2026-03-27',
      updated: '2026-03-27',
      ...overrides.meta,
    },
    body: overrides.body ?? 'Default body.',
  }
}

describe('diffSpecs', () => {
  it('detects added specs', () => {
    const oldSpecs: SpecFile[] = []
    const newSpecs = [makeSpec({ meta: { id: 'SPEC-001' } })]
    const changes = diffSpecs(oldSpecs, newSpecs)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('added')
    expect(changes[0].specId).toBe('SPEC-001')
  })

  it('detects removed specs', () => {
    const oldSpecs = [makeSpec({ meta: { id: 'SPEC-001' } })]
    const newSpecs: SpecFile[] = []
    const changes = diffSpecs(oldSpecs, newSpecs)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('removed')
    expect(changes[0].specId).toBe('SPEC-001')
  })

  it('detects modified specs with field-level changes', () => {
    const oldSpecs = [makeSpec({ meta: { id: 'SPEC-001', title: 'Old Title' } })]
    const newSpecs = [makeSpec({ meta: { id: 'SPEC-001', title: 'New Title' } })]
    const changes = diffSpecs(oldSpecs, newSpecs)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('modified')
    expect(changes[0].fieldChanges).toBeDefined()
    const titleChange = changes[0].fieldChanges!.find((c) => c.field === 'title')
    expect(titleChange).toBeDefined()
    expect(titleChange!.oldValue).toBe('Old Title')
    expect(titleChange!.newValue).toBe('New Title')
  })

  it('detects body changes', () => {
    const oldSpecs = [makeSpec({ meta: { id: 'SPEC-001' }, body: 'Old body' })]
    const newSpecs = [makeSpec({ meta: { id: 'SPEC-001' }, body: 'New body' })]
    const changes = diffSpecs(oldSpecs, newSpecs)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe('modified')
    const bodyChange = changes[0].fieldChanges!.find((c) => c.field === 'body')
    expect(bodyChange).toBeDefined()
    expect(bodyChange!.oldValue).toBe('Old body')
    expect(bodyChange!.newValue).toBe('New body')
  })

  it('returns empty array when no changes', () => {
    const specs = [makeSpec({ meta: { id: 'SPEC-001' } })]
    const changes = diffSpecs(specs, specs)
    expect(changes).toEqual([])
  })

  it('handles mixed changes (add + modify + remove)', () => {
    const oldSpecs = [
      makeSpec({ meta: { id: 'SPEC-001', title: 'Old' } }),
      makeSpec({ meta: { id: 'SPEC-002' } }),
    ]
    const newSpecs = [
      makeSpec({ meta: { id: 'SPEC-001', title: 'New' } }),
      makeSpec({ meta: { id: 'SPEC-003' } }),
    ]
    const changes = diffSpecs(oldSpecs, newSpecs)
    expect(changes).toHaveLength(3)
    const types = changes.map((c) => c.type).sort()
    expect(types).toEqual(['added', 'modified', 'removed'])
    expect(changes.find((c) => c.type === 'added')!.specId).toBe('SPEC-003')
    expect(changes.find((c) => c.type === 'removed')!.specId).toBe('SPEC-002')
    expect(changes.find((c) => c.type === 'modified')!.specId).toBe('SPEC-001')
  })
})
