import matter from 'gray-matter'
import { z } from 'zod'
import type { SpecFile, SpecMeta } from '../types.js'

const specMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  status: z.enum(['draft', 'approved', 'implemented', 'deprecated']),
  fulfillment: z.enum(['unfulfilled', 'partial', 'fulfilled']),
  fulfillment_explanation: z.string().default(''),
  depends_on: z.array(z.string()).default([]),
  relates_to: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  created: z.string(),
  updated: z.string(),
})

export function parseSpec(filePath: string, content: string): SpecFile {
  const { data, content: body } = matter(content)
  const meta = specMetaSchema.parse(data) as SpecMeta
  return { path: filePath, meta, body: body.trimStart() }
}

export function parseSpecSafe(filePath: string, content: string): SpecFile | null {
  try {
    return parseSpec(filePath, content)
  } catch {
    return null
  }
}
