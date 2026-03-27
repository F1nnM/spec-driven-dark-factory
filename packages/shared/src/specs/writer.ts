import matter from 'gray-matter'
import type { SpecFile } from '../types.js'

export function writeSpec(spec: SpecFile): string {
  return matter.stringify(spec.body, spec.meta)
}
