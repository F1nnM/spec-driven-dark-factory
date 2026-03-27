export { parseSpec, parseSpecSafe } from './parser.js'
export { writeSpec } from './writer.js'
export { diffSpecs, type SpecChangeType, type SpecFieldChange, type SpecChange } from './diff.js'
export {
  buildSpecIndex,
  getTransitiveDependencies,
  getTransitiveDependents,
  type SpecIndex,
} from './index-builder.js'
