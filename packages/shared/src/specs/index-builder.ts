import type { SpecFile } from '../types.js'

export interface SpecIndex {
  specs: Map<string, SpecFile>
  dependents: Map<string, Set<string>>
  dependencies: Map<string, Set<string>>
  related: Map<string, Set<string>>
}

function getOrCreateSet(map: Map<string, Set<string>>, key: string): Set<string> {
  let set = map.get(key)
  if (!set) {
    set = new Set()
    map.set(key, set)
  }
  return set
}

export function buildSpecIndex(specs: SpecFile[]): SpecIndex {
  const index: SpecIndex = {
    specs: new Map(),
    dependents: new Map(),
    dependencies: new Map(),
    related: new Map(),
  }

  for (const spec of specs) {
    index.specs.set(spec.meta.id, spec)
  }

  for (const spec of specs) {
    const id = spec.meta.id

    for (const dep of spec.meta.depends_on) {
      getOrCreateSet(index.dependencies, id).add(dep)
      getOrCreateSet(index.dependents, dep).add(id)
    }

    for (const rel of spec.meta.relates_to) {
      getOrCreateSet(index.related, id).add(rel)
      getOrCreateSet(index.related, rel).add(id)
    }
  }

  return index
}

function bfsCollect(graph: Map<string, Set<string>>, startId: string): Set<string> {
  const visited = new Set<string>()
  const queue = [startId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const neighbors = graph.get(current)
    if (!neighbors) continue
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && neighbor !== startId) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  return visited
}

export function getTransitiveDependencies(index: SpecIndex, specId: string): Set<string> {
  return bfsCollect(index.dependencies, specId)
}

export function getTransitiveDependents(index: SpecIndex, specId: string): Set<string> {
  return bfsCollect(index.dependents, specId)
}
