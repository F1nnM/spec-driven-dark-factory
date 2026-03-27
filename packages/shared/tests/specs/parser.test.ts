import { describe, expect, it } from 'vitest'
import { parseSpec, parseSpecSafe } from '../../src/specs/parser.js'
import { writeSpec } from '../../src/specs/writer.js'

const validSpecContent = `---
id: SPEC-001
title: User Authentication
category: security
status: approved
fulfillment: partial
fulfillment_explanation: OAuth implemented, session expiry pending
depends_on:
  - SPEC-003
relates_to:
  - SPEC-005
tags:
  - auth
  - oauth
created: "2026-03-26"
updated: "2026-03-26"
---
## Overview
The system shall authenticate users via OAuth 2.0.
`

const minimalSpecContent = `---
id: SPEC-002
title: Minimal Spec
category: general
status: draft
fulfillment: unfulfilled
created: "2026-03-27"
updated: "2026-03-27"
---
Just a body.
`

describe('parseSpec', () => {
  it('parses a valid spec file with all meta fields', () => {
    const spec = parseSpec('/specs/SPEC-001.md', validSpecContent)
    expect(spec.path).toBe('/specs/SPEC-001.md')
    expect(spec.meta.id).toBe('SPEC-001')
    expect(spec.meta.title).toBe('User Authentication')
    expect(spec.meta.category).toBe('security')
    expect(spec.meta.status).toBe('approved')
    expect(spec.meta.fulfillment).toBe('partial')
    expect(spec.meta.fulfillment_explanation).toBe('OAuth implemented, session expiry pending')
    expect(spec.meta.depends_on).toEqual(['SPEC-003'])
    expect(spec.meta.relates_to).toEqual(['SPEC-005'])
    expect(spec.meta.tags).toEqual(['auth', 'oauth'])
    expect(spec.meta.created).toBe('2026-03-26')
    expect(spec.meta.updated).toBe('2026-03-26')
    expect(spec.body).toContain('OAuth 2.0')
  })

  it('parses with missing optional fields and applies defaults', () => {
    const spec = parseSpec('/specs/SPEC-002.md', minimalSpecContent)
    expect(spec.meta.id).toBe('SPEC-002')
    expect(spec.meta.depends_on).toEqual([])
    expect(spec.meta.relates_to).toEqual([])
    expect(spec.meta.tags).toEqual([])
    expect(spec.meta.fulfillment_explanation).toBe('')
  })

  it('throws on invalid frontmatter', () => {
    const badContent = `---
title: Missing required fields
---
Body text.
`
    expect(() => parseSpec('/specs/bad.md', badContent)).toThrow()
  })
})

describe('parseSpecSafe', () => {
  it('returns null for malformed frontmatter', () => {
    const result = parseSpecSafe('/specs/bad.md', 'not valid frontmatter at all {{{}}}')
    expect(result).toBeNull()
  })

  it('returns null for missing required fields', () => {
    const badContent = `---
title: Only a title
---
Body.
`
    const result = parseSpecSafe('/specs/bad.md', badContent)
    expect(result).toBeNull()
  })

  it('returns a valid spec for good content', () => {
    const result = parseSpecSafe('/specs/SPEC-001.md', validSpecContent)
    expect(result).not.toBeNull()
    expect(result!.meta.id).toBe('SPEC-001')
  })
})

describe('round-trip: parse -> write -> parse', () => {
  it('produces identical result', () => {
    const original = parseSpec('/specs/SPEC-001.md', validSpecContent)
    const written = writeSpec(original)
    const reparsed = parseSpec('/specs/SPEC-001.md', written)
    expect(reparsed.meta).toEqual(original.meta)
    expect(reparsed.body.trim()).toBe(original.body.trim())
  })
})
