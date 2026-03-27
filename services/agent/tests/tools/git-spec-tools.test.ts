import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createGitSpecTools } from '../../src/tools/git-spec-tools'

const TEST_DIR = join('/tmp', `git-spec-tools-test-${Date.now()}`)
const REPO_DIR = join(TEST_DIR, 'repo')
const SPECS_PATH = 'specs'
const BRANCH = 'revision-1'

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: REPO_DIR, encoding: 'utf-8' }).trim()
}

const SPEC_CONTENT_1 = `---
id: SPEC-001
title: User Authentication
category: security
status: draft
fulfillment: unfulfilled
fulfillment_explanation: ""
depends_on: []
relates_to: []
tags:
  - auth
created: "2026-03-27"
updated: "2026-03-27"
---

## Overview
Users authenticate via OAuth 2.0.

## Acceptance Criteria
- Users can log in with Google
`

const SPEC_CONTENT_2 = `---
id: SPEC-002
title: API Rate Limiting
category: infrastructure
status: draft
fulfillment: unfulfilled
fulfillment_explanation: ""
depends_on:
  - SPEC-001
relates_to: []
tags:
  - api
created: "2026-03-27"
updated: "2026-03-27"
---

## Overview
API endpoints have rate limiting.

## Acceptance Criteria
- 100 requests per minute per user
`

describe('git-spec-tools', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })

    // Init repo
    git('init')
    git('config user.email "test@example.com"')
    git('config user.name "Test User"')

    // Create initial commit on main
    writeFileSync(join(REPO_DIR, 'README.md'), '# Test\n')
    git('add README.md')
    git('commit -m "Initial commit"')

    // Rename default branch to main if needed
    const currentBranch = git('rev-parse --abbrev-ref HEAD')
    if (currentBranch !== 'main') {
      git('branch -M main')
    }

    // Create specs directory with initial specs
    mkdirSync(join(REPO_DIR, SPECS_PATH), { recursive: true })
    writeFileSync(join(REPO_DIR, SPECS_PATH, 'SPEC-001-auth.md'), SPEC_CONTENT_1)
    writeFileSync(join(REPO_DIR, SPECS_PATH, 'SPEC-002-rate-limiting.md'), SPEC_CONTENT_2)
    git('add specs/')
    git('commit -m "Add initial specs"')

    // Create revision branch
    git(`branch ${BRANCH}`)
  })

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('read_all_specs returns all spec files', async () => {
    const tools = createGitSpecTools(REPO_DIR, BRANCH, SPECS_PATH)
    const readAll = tools.find((t) => t.name === 'read_all_specs')!

    const result = await readAll.execute({})
    const specs = JSON.parse(result) as { path: string; content: string }[]

    expect(specs).toHaveLength(2)
    expect(specs.map((s) => s.path).sort()).toEqual([
      'specs/SPEC-001-auth.md',
      'specs/SPEC-002-rate-limiting.md',
    ])
    expect(specs[0]!.content).toContain('id: SPEC-')
  })

  it('read_spec reads a single spec file', async () => {
    const tools = createGitSpecTools(REPO_DIR, BRANCH, SPECS_PATH)
    const readSpec = tools.find((t) => t.name === 'read_spec')!

    const result = await readSpec.execute({ path: 'specs/SPEC-001-auth.md' })
    expect(result).toContain('User Authentication')
    expect(result).toContain('SPEC-001')
  })

  it('read_spec returns error for nonexistent file', async () => {
    const tools = createGitSpecTools(REPO_DIR, BRANCH, SPECS_PATH)
    const readSpec = tools.find((t) => t.name === 'read_spec')!

    const result = await readSpec.execute({ path: 'specs/NONEXISTENT.md' })
    expect(result).toContain('Error')
  })

  it('write_spec creates a new spec file', async () => {
    const tools = createGitSpecTools(REPO_DIR, BRANCH, SPECS_PATH)
    const writeSpec = tools.find((t) => t.name === 'write_spec')!

    const newSpec = `---
id: SPEC-003
title: Logging
category: infrastructure
status: draft
fulfillment: unfulfilled
fulfillment_explanation: ""
depends_on: []
relates_to: []
tags: []
created: "2026-03-27"
updated: "2026-03-27"
---

## Overview
Structured logging for all services.

## Acceptance Criteria
- JSON log format
`

    const result = await writeSpec.execute({
      path: 'specs/SPEC-003-logging.md',
      content: newSpec,
    })

    expect(result).toContain('Wrote spec file')
    expect(existsSync(join(REPO_DIR, 'specs', 'SPEC-003-logging.md'))).toBe(true)

    const written = readFileSync(join(REPO_DIR, 'specs', 'SPEC-003-logging.md'), 'utf-8')
    expect(written).toContain('SPEC-003')
    expect(written).toContain('Logging')
  })

  it('commit_specs creates a commit with changes', async () => {
    const tools = createGitSpecTools(REPO_DIR, BRANCH, SPECS_PATH)
    const commitSpecs = tools.find((t) => t.name === 'commit_specs')!

    const result = await commitSpecs.execute({ message: 'Add SPEC-003 logging' })
    expect(result).toContain('Committed:')
    expect(result).toMatch(/[0-9a-f]{40}/)

    // Verify the commit exists
    const log = git('log --oneline -1')
    expect(log).toContain('Add SPEC-003 logging')
  })

  it('commit_specs reports no changes when nothing to commit', async () => {
    const tools = createGitSpecTools(REPO_DIR, BRANCH, SPECS_PATH)
    const commitSpecs = tools.find((t) => t.name === 'commit_specs')!

    const result = await commitSpecs.execute({ message: 'No changes' })
    expect(result).toBe('No changes to commit.')
  })

  it('delete_spec removes a spec file', async () => {
    const tools = createGitSpecTools(REPO_DIR, BRANCH, SPECS_PATH)
    const deleteSpec = tools.find((t) => t.name === 'delete_spec')!

    const result = await deleteSpec.execute({ path: 'specs/SPEC-003-logging.md' })
    expect(result).toContain('Deleted spec file')
    expect(existsSync(join(REPO_DIR, 'specs', 'SPEC-003-logging.md'))).toBe(false)

    // Commit the deletion
    const commitSpecs = tools.find((t) => t.name === 'commit_specs')!
    await commitSpecs.execute({ message: 'Delete SPEC-003' })
  })

  it('delete_spec returns error for nonexistent file', async () => {
    const tools = createGitSpecTools(REPO_DIR, BRANCH, SPECS_PATH)
    const deleteSpec = tools.find((t) => t.name === 'delete_spec')!

    const result = await deleteSpec.execute({ path: 'specs/NONEXISTENT.md' })
    expect(result).toContain('Error')
  })

  it('list_categories returns unique categories', async () => {
    const tools = createGitSpecTools(REPO_DIR, BRANCH, SPECS_PATH)
    const listCategories = tools.find((t) => t.name === 'list_categories')!

    const result = await listCategories.execute({})
    const categories = JSON.parse(result) as string[]

    expect(categories).toContain('security')
    expect(categories).toContain('infrastructure')
    expect(categories).toHaveLength(2)
  })
})
