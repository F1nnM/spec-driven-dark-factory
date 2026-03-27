import { describe, expect, it } from 'vitest'
import { buildSpecIndex, getTransitiveDependencies, getTransitiveDependents } from '../../src/specs/index-builder.js'
import type { SpecFile } from '../../src/types.js'

function makeSpec(id: string, deps: string[] = [], related: string[] = []): SpecFile {
  return {
    path: `/specs/${id}.md`,
    meta: {
      id,
      title: `Spec ${id}`,
      category: 'general',
      status: 'draft',
      fulfillment: 'unfulfilled',
      fulfillment_explanation: '',
      depends_on: deps,
      relates_to: related,
      tags: [],
      created: '2026-03-27',
      updated: '2026-03-27',
    },
    body: `Body for ${id}`,
  }
}

describe('buildSpecIndex', () => {
  it('builds index from specs with depends_on', () => {
    const specs = [
      makeSpec('A', ['B']),
      makeSpec('B', ['C']),
      makeSpec('C'),
    ]
    const index = buildSpecIndex(specs)

    expect(index.specs.size).toBe(3)
    expect(index.dependencies.get('A')).toEqual(new Set(['B']))
    expect(index.dependencies.get('B')).toEqual(new Set(['C']))
    expect(index.dependents.get('B')).toEqual(new Set(['A']))
    expect(index.dependents.get('C')).toEqual(new Set(['B']))
  })

  it('handles relates_to bidirectionally', () => {
    const specs = [
      makeSpec('A', [], ['B']),
      makeSpec('B'),
    ]
    const index = buildSpecIndex(specs)

    expect(index.related.get('A')).toEqual(new Set(['B']))
    expect(index.related.get('B')).toEqual(new Set(['A']))
  })

  it('handles orphan specs with no relations', () => {
    const specs = [makeSpec('A'), makeSpec('B')]
    const index = buildSpecIndex(specs)

    expect(index.specs.size).toBe(2)
    expect(index.dependencies.get('A') ?? new Set()).toEqual(new Set())
    expect(index.dependents.get('A') ?? new Set()).toEqual(new Set())
  })
})

describe('getTransitiveDependencies', () => {
  it('finds transitive dependencies (A->B->C)', () => {
    const specs = [
      makeSpec('A', ['B']),
      makeSpec('B', ['C']),
      makeSpec('C'),
    ]
    const index = buildSpecIndex(specs)
    const deps = getTransitiveDependencies(index, 'A')
    expect(deps).toEqual(new Set(['B', 'C']))
  })

  it('returns empty set for spec with no dependencies', () => {
    const specs = [makeSpec('A')]
    const index = buildSpecIndex(specs)
    expect(getTransitiveDependencies(index, 'A')).toEqual(new Set())
  })

  it('handles circular dependencies without infinite loop', () => {
    const specs = [
      makeSpec('A', ['B']),
      makeSpec('B', ['C']),
      makeSpec('C', ['A']),
    ]
    const index = buildSpecIndex(specs)
    const deps = getTransitiveDependencies(index, 'A')
    expect(deps).toEqual(new Set(['B', 'C']))
  })
})

describe('getTransitiveDependents', () => {
  it('finds transitive dependents (C is depended on by B, which is depended on by A)', () => {
    const specs = [
      makeSpec('A', ['B']),
      makeSpec('B', ['C']),
      makeSpec('C'),
    ]
    const index = buildSpecIndex(specs)
    const dependents = getTransitiveDependents(index, 'C')
    expect(dependents).toEqual(new Set(['A', 'B']))
  })

  it('returns empty set for spec with no dependents', () => {
    const specs = [makeSpec('A', ['B']), makeSpec('B')]
    const index = buildSpecIndex(specs)
    expect(getTransitiveDependents(index, 'A')).toEqual(new Set())
  })

  it('handles circular dependencies without infinite loop', () => {
    const specs = [
      makeSpec('A', ['B']),
      makeSpec('B', ['C']),
      makeSpec('C', ['A']),
    ]
    const index = buildSpecIndex(specs)
    const dependents = getTransitiveDependents(index, 'C')
    expect(dependents).toEqual(new Set(['A', 'B']))
  })
})
