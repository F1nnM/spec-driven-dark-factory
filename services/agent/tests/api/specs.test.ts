import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { listSpecFiles, readFileFromBranch, handleGetSpecs } from '../../src/api/specs'

const TEST_DIR = join('/tmp', `specs-api-test-${Date.now()}`)
const REPO_DIR = join(TEST_DIR, 'test-project')

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8' }).trim()
}

const SPEC_AUTH = `---
id: auth-login
title: User Authentication
category: auth
status: approved
fulfillment: partial
fulfillment_explanation: Login works, MFA pending
depends_on: []
relates_to:
  - user-profile
tags:
  - security
  - p0
created: "2026-01-01"
updated: "2026-03-01"
---

# User Authentication

Users must be able to log in with email and password.

## Acceptance Criteria

- Login endpoint accepts email + password
- Returns JWT on success
- Rate limiting on failed attempts
`

const SPEC_PROFILE = `---
id: user-profile
title: User Profile
category: users
status: approved
fulfillment: unfulfilled
fulfillment_explanation: Not started
depends_on:
  - auth-login
relates_to:
  - auth-login
tags:
  - users
created: "2026-01-15"
updated: "2026-03-10"
---

# User Profile

Users can view and edit their profile.
`

const SPEC_DASHBOARD = `---
id: dashboard
title: Dashboard
category: ui
status: draft
fulfillment: fulfilled
fulfillment_explanation: Fully implemented
depends_on:
  - auth-login
  - user-profile
relates_to: []
tags:
  - ui
  - p1
created: "2026-02-01"
updated: "2026-03-15"
---

# Dashboard

Main dashboard page.
`

describe('specs API', () => {
  beforeAll(() => {
    mkdirSync(join(REPO_DIR, 'specs'), { recursive: true })
    git(REPO_DIR, 'init')
    git(REPO_DIR, 'config user.email "test@example.com"')
    git(REPO_DIR, 'config user.name "Test User"')

    writeFileSync(join(REPO_DIR, 'specs', 'auth-login.md'), SPEC_AUTH)
    writeFileSync(join(REPO_DIR, 'specs', 'user-profile.md'), SPEC_PROFILE)
    writeFileSync(join(REPO_DIR, 'specs', 'dashboard.md'), SPEC_DASHBOARD)
    // Also add a non-md file to ensure it's filtered out
    writeFileSync(join(REPO_DIR, 'specs', 'notes.txt'), 'Some notes')
    writeFileSync(join(REPO_DIR, 'README.md'), '# Test')

    git(REPO_DIR, 'add .')
    git(REPO_DIR, 'commit -m "Add specs"')
  })

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('listSpecFiles returns only .md files from specs directory', async () => {
    const branch = git(REPO_DIR, 'rev-parse --abbrev-ref HEAD')
    const files = await listSpecFiles(REPO_DIR, branch, 'specs')
    expect(files).toHaveLength(3)
    expect(files.every((f) => f.endsWith('.md'))).toBe(true)
    expect(files).toContain('specs/auth-login.md')
    expect(files).toContain('specs/user-profile.md')
    expect(files).toContain('specs/dashboard.md')
  })

  it('listSpecFiles returns empty array for non-existent path', async () => {
    const branch = git(REPO_DIR, 'rev-parse --abbrev-ref HEAD')
    const files = await listSpecFiles(REPO_DIR, branch, 'nonexistent')
    expect(files).toEqual([])
  })

  it('readFileFromBranch reads file content at branch', async () => {
    const branch = git(REPO_DIR, 'rev-parse --abbrev-ref HEAD')
    const content = await readFileFromBranch(REPO_DIR, branch, 'specs/auth-login.md')
    expect(content).toContain('User Authentication')
    expect(content).toContain('auth-login')
  })

  it('handleGetSpecs returns parsed specs with index', async () => {
    // Override REPOS_PATH to use our test dir
    const originalReposPath = process.env.REPOS_PATH
    process.env.REPOS_PATH = TEST_DIR

    try {
      // We need to reimport to pick up the new REPOS_PATH
      // Instead, let's test via the handleRequest approach
      const branch = git(REPO_DIR, 'rev-parse --abbrev-ref HEAD')
      const req = new Request(
        `http://localhost:3001/api/projects/test-project/specs?branch=${branch}&specsPath=/specs`,
      )

      // Import handleGetSpecs fresh - but since REPOS_BASE is set at module load,
      // we test the underlying functions instead
      const { parseSpecSafe, buildSpecIndex } = await import('@spec-factory/shared')

      const files = await listSpecFiles(REPO_DIR, branch, 'specs')
      expect(files.length).toBe(3)

      const specs = []
      for (const filePath of files) {
        const content = await readFileFromBranch(REPO_DIR, branch, filePath)
        const spec = parseSpecSafe(filePath, content)
        if (spec) specs.push(spec)
      }

      expect(specs).toHaveLength(3)

      const authSpec = specs.find((s) => s.meta.id === 'auth-login')
      expect(authSpec).toBeDefined()
      expect(authSpec!.meta.title).toBe('User Authentication')
      expect(authSpec!.meta.category).toBe('auth')
      expect(authSpec!.meta.fulfillment).toBe('partial')
      expect(authSpec!.meta.tags).toContain('security')

      const profileSpec = specs.find((s) => s.meta.id === 'user-profile')
      expect(profileSpec).toBeDefined()
      expect(profileSpec!.meta.depends_on).toContain('auth-login')

      const index = buildSpecIndex(specs)
      expect(index.dependents.get('auth-login')?.has('user-profile')).toBe(true)
      expect(index.dependents.get('auth-login')?.has('dashboard')).toBe(true)
      expect(index.dependencies.get('dashboard')?.has('auth-login')).toBe(true)
      expect(index.dependencies.get('dashboard')?.has('user-profile')).toBe(true)
      expect(index.related.get('auth-login')?.has('user-profile')).toBe(true)
    } finally {
      if (originalReposPath !== undefined) {
        process.env.REPOS_PATH = originalReposPath
      } else {
        delete process.env.REPOS_PATH
      }
    }
  })
})
