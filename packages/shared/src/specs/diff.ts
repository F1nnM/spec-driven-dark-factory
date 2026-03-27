import type { SpecFile } from '../types.js'

export type SpecChangeType = 'added' | 'modified' | 'removed'

export interface SpecFieldChange {
  field: string
  oldValue: unknown
  newValue: unknown
}

export interface SpecChange {
  specId: string
  type: SpecChangeType
  spec: SpecFile
  fieldChanges?: SpecFieldChange[]
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((val, i) => deepEqual(val, b[i]))
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const keysA = Object.keys(a as Record<string, unknown>)
    const keysB = Object.keys(b as Record<string, unknown>)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  }
  return false
}

export function diffSpecs(oldSpecs: SpecFile[], newSpecs: SpecFile[]): SpecChange[] {
  const oldMap = new Map(oldSpecs.map((s) => [s.meta.id, s]))
  const newMap = new Map(newSpecs.map((s) => [s.meta.id, s]))
  const changes: SpecChange[] = []

  for (const [id, newSpec] of newMap) {
    const oldSpec = oldMap.get(id)
    if (!oldSpec) {
      changes.push({ specId: id, type: 'added', spec: newSpec })
    } else {
      const fieldChanges: SpecFieldChange[] = []
      const metaKeys = Object.keys(newSpec.meta) as (keyof typeof newSpec.meta)[]
      for (const key of metaKeys) {
        if (!deepEqual(oldSpec.meta[key], newSpec.meta[key])) {
          fieldChanges.push({ field: key, oldValue: oldSpec.meta[key], newValue: newSpec.meta[key] })
        }
      }
      if (oldSpec.body !== newSpec.body) {
        fieldChanges.push({ field: 'body', oldValue: oldSpec.body, newValue: newSpec.body })
      }
      if (fieldChanges.length > 0) {
        changes.push({ specId: id, type: 'modified', spec: newSpec, fieldChanges })
      }
    }
  }

  for (const [id, oldSpec] of oldMap) {
    if (!newMap.has(id)) {
      changes.push({ specId: id, type: 'removed', spec: oldSpec })
    }
  }

  return changes
}
