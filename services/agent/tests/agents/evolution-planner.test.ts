import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createEvolutionPlannerTools } from '../../src/tools/evolution-planner-tools'
import { squashRevisionBranch } from '../../src/agents/evolution-planner'

const TEST_DIR = join('/tmp', `evolution-planner-test-${Date.now()}`)
const REPO_DIR = join(TEST_DIR, 'repo')
const SPECS_PATH = 'specs'
const REVISION_NUMBER = 1
const REVISION_BRANCH = 'revision-1'

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: REPO_DIR, encoding: 'utf-8' }).trim()
}

function makeSpec(id: string, title: string, category: string, deps: string[] = []): string {
  const depsYaml = deps.length > 0
    ? `\n${deps.map((d) => `  - ${d}`).join('\n')}`
    : ' []'
  return `---
id: ${id}
title: ${title}
category: ${category}
status: draft
fulfillment: unfulfilled
fulfillment_explanation: ""
depends_on:${depsYaml}
relates_to: []
tags: []
created: "2026-03-27"
updated: "2026-03-27"
---

## Overview
${title} overview.

## Acceptance Criteria
- Criterion for ${title}
`
}

// S1 specs (on main)
const SPEC_001 = makeSpec('SPEC-001', 'User Authentication', 'security')
const SPEC_002 = makeSpec('SPEC-002', 'API Rate Limiting', 'infrastructure', ['SPEC-001'])

// S2 specs (on revision branch): add SPEC-003, modify SPEC-002, remove nothing
const SPEC_002_MODIFIED = makeSpec('SPEC-002', 'API Rate Limiting v2', 'infrastructure', ['SPEC-001'])
const SPEC_003 = makeSpec('SPEC-003', 'Logging', 'infrastructure')
const SPEC_004 = makeSpec('SPEC-004', 'Monitoring', 'observability', ['SPEC-003'])

describe('evolution-planner tools', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })

    // Init repo
    git('init')
    git('config user.email "test@example.com"')
    git('config user.name "Test User"')

    // Initial commit
    writeFileSync(join(REPO_DIR, 'README.md'), '# Test\n')
    git('add README.md')
    git('commit -m "Initial commit"')

    // Rename to main
    const currentBranch = git('rev-parse --abbrev-ref HEAD')
    if (currentBranch !== 'main') {
      git('branch -M main')
    }

    // Create S1 specs on main
    mkdirSync(join(REPO_DIR, SPECS_PATH), { recursive: true })
    writeFileSync(join(REPO_DIR, SPECS_PATH, 'SPEC-001-auth.md'), SPEC_001)
    writeFileSync(join(REPO_DIR, SPECS_PATH, 'SPEC-002-rate-limiting.md'), SPEC_002)
    git('add specs/')
    git('commit -m "Add S1 specs"')

    // Create revision branch with S2 specs
    git(`branch ${REVISION_BRANCH}`)
    git(`checkout ${REVISION_BRANCH}`)

    // Modify SPEC-002, add SPEC-003 and SPEC-004
    writeFileSync(join(REPO_DIR, SPECS_PATH, 'SPEC-002-rate-limiting.md'), SPEC_002_MODIFIED)
    writeFileSync(join(REPO_DIR, SPECS_PATH, 'SPEC-003-logging.md'), SPEC_003)
    writeFileSync(join(REPO_DIR, SPECS_PATH, 'SPEC-004-monitoring.md'), SPEC_004)
    git('add specs/')
    git('commit -m "S2: modify rate limiting, add logging and monitoring"')

    // Go back to main
    git('checkout main')
  })

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('analyze_diff returns correct spec changes', async () => {
    const tools = createEvolutionPlannerTools({
      repoPath: REPO_DIR,
      specsPath: SPECS_PATH,
      revisionNumber: REVISION_NUMBER,
      revisionBranch: REVISION_BRANCH,
    })
    const analyzeDiff = tools.find((t) => t.name === 'analyze_diff')!

    const result = await analyzeDiff.execute({})
    const changes = JSON.parse(result) as {
      specId: string
      type: string
      spec: unknown
      fieldChanges?: unknown[]
    }[]

    // Should have: SPEC-002 modified, SPEC-003 added, SPEC-004 added
    expect(changes).toHaveLength(3)

    const modified = changes.find((c) => c.specId === 'SPEC-002')
    expect(modified).toBeDefined()
    expect(modified!.type).toBe('modified')

    const added003 = changes.find((c) => c.specId === 'SPEC-003')
    expect(added003).toBeDefined()
    expect(added003!.type).toBe('added')

    const added004 = changes.find((c) => c.specId === 'SPEC-004')
    expect(added004).toBeDefined()
    expect(added004!.type).toBe('added')
  })

  it('create_step_branch creates a branch with correct spec commits', async () => {
    const tools = createEvolutionPlannerTools({
      repoPath: REPO_DIR,
      specsPath: SPECS_PATH,
      revisionNumber: REVISION_NUMBER,
      revisionBranch: REVISION_BRANCH,
    })
    const createStep = tools.find((t) => t.name === 'create_step_branch')!

    // Step 1: add logging spec and modify rate limiting
    const result1 = await createStep.execute({
      stepNumber: 1,
      description: 'Add logging spec and update rate limiting',
      specChanges: [
        { path: 'specs/SPEC-002-rate-limiting.md', action: 'modify' },
        { path: 'specs/SPEC-003-logging.md', action: 'add' },
      ],
    })

    const step1 = JSON.parse(result1) as {
      stepNumber: number
      branchName: string
      specCommitHash: string
    }

    expect(step1.stepNumber).toBe(1)
    expect(step1.branchName).toBe('revision-1-step-1')
    expect(step1.specCommitHash).toMatch(/^[0-9a-f]{40}$/)

    // Verify the branch exists and has the right files
    const step1Files = git('ls-tree -r --name-only revision-1-step-1 -- specs/')
    expect(step1Files).toContain('SPEC-001-auth.md') // unchanged from main
    expect(step1Files).toContain('SPEC-002-rate-limiting.md') // modified
    expect(step1Files).toContain('SPEC-003-logging.md') // added

    // Verify SPEC-002 content is from revision branch
    const spec002Content = execSync(
      `git show revision-1-step-1:specs/SPEC-002-rate-limiting.md`,
      { cwd: REPO_DIR, encoding: 'utf-8' },
    )
    expect(spec002Content).toContain('API Rate Limiting v2')

    // Step 2: add monitoring spec (depends on SPEC-003 from step 1)
    const result2 = await createStep.execute({
      stepNumber: 2,
      description: 'Add monitoring spec',
      specChanges: [
        { path: 'specs/SPEC-004-monitoring.md', action: 'add' },
      ],
    })

    const step2 = JSON.parse(result2) as {
      stepNumber: number
      branchName: string
      specCommitHash: string
    }

    expect(step2.stepNumber).toBe(2)
    expect(step2.branchName).toBe('revision-1-step-2')
    expect(step2.specCommitHash).toMatch(/^[0-9a-f]{40}$/)

    // Step 2 should have all 4 specs (inherited step 1 + new SPEC-004)
    const step2Files = git('ls-tree -r --name-only revision-1-step-2 -- specs/')
    expect(step2Files).toContain('SPEC-001-auth.md')
    expect(step2Files).toContain('SPEC-002-rate-limiting.md')
    expect(step2Files).toContain('SPEC-003-logging.md')
    expect(step2Files).toContain('SPEC-004-monitoring.md')
  })

  it('list_steps returns existing step branches', async () => {
    const tools = createEvolutionPlannerTools({
      repoPath: REPO_DIR,
      specsPath: SPECS_PATH,
      revisionNumber: REVISION_NUMBER,
      revisionBranch: REVISION_BRANCH,
    })
    const listSteps = tools.find((t) => t.name === 'list_steps')!

    const result = await listSteps.execute({})
    const steps = JSON.parse(result) as { stepNumber: number; branchName: string }[]

    expect(steps).toHaveLength(2)
    expect(steps[0]!.stepNumber).toBe(1)
    expect(steps[0]!.branchName).toBe('revision-1-step-1')
    expect(steps[1]!.stepNumber).toBe(2)
    expect(steps[1]!.branchName).toBe('revision-1-step-2')
  })

  it('step branches form a valid path from S1 to S2', async () => {
    // The final step branch should contain the same specs as the revision branch
    const revisionFiles = git(`ls-tree -r --name-only ${REVISION_BRANCH} -- specs/`)
      .split('\n')
      .sort()
    const step2Files = git('ls-tree -r --name-only revision-1-step-2 -- specs/')
      .split('\n')
      .sort()

    expect(step2Files).toEqual(revisionFiles)

    // Verify content matches too
    for (const file of revisionFiles) {
      const revContent = execSync(`git show ${REVISION_BRANCH}:${file}`, {
        cwd: REPO_DIR,
        encoding: 'utf-8',
      })
      const stepContent = execSync(`git show revision-1-step-2:${file}`, {
        cwd: REPO_DIR,
        encoding: 'utf-8',
      })
      expect(stepContent.trim()).toBe(revContent.trim())
    }
  })
})

describe('squashRevisionBranch', () => {
  const SQUASH_TEST_DIR = join('/tmp', `squash-test-${Date.now()}`)
  const SQUASH_REPO_DIR = join(SQUASH_TEST_DIR, 'repo')

  beforeAll(() => {
    mkdirSync(SQUASH_TEST_DIR, { recursive: true })
    mkdirSync(SQUASH_REPO_DIR, { recursive: true })

    const sqGit = (args: string) =>
      execSync(`git ${args}`, { cwd: SQUASH_REPO_DIR, encoding: 'utf-8' }).trim()

    sqGit('init')
    sqGit('config user.email "test@example.com"')
    sqGit('config user.name "Test User"')

    writeFileSync(join(SQUASH_REPO_DIR, 'README.md'), '# Test\n')
    sqGit('add README.md')
    sqGit('commit -m "Initial commit"')

    const currentBranch = sqGit('rev-parse --abbrev-ref HEAD')
    if (currentBranch !== 'main') {
      sqGit('branch -M main')
    }

    // Create revision branch with multiple commits
    sqGit('branch revision-1')
    sqGit('checkout revision-1')

    mkdirSync(join(SQUASH_REPO_DIR, 'specs'), { recursive: true })
    writeFileSync(join(SQUASH_REPO_DIR, 'specs', 'SPEC-001.md'), makeSpec('SPEC-001', 'A', 'cat'))
    sqGit('add specs/')
    sqGit('commit -m "Add SPEC-001"')

    writeFileSync(join(SQUASH_REPO_DIR, 'specs', 'SPEC-002.md'), makeSpec('SPEC-002', 'B', 'cat'))
    sqGit('add specs/')
    sqGit('commit -m "Add SPEC-002"')

    sqGit('checkout main')
  })

  afterAll(() => {
    if (existsSync(SQUASH_TEST_DIR)) {
      rmSync(SQUASH_TEST_DIR, { recursive: true, force: true })
    }
  })

  it('squashes multiple commits into one', async () => {
    const sqGit = (args: string) =>
      execSync(`git ${args}`, { cwd: SQUASH_REPO_DIR, encoding: 'utf-8' }).trim()

    // Count commits before squash (should be 3: initial + 2 spec commits)
    const beforeCount = sqGit('rev-list --count revision-1')
    expect(parseInt(beforeCount, 10)).toBe(3)

    await squashRevisionBranch(SQUASH_REPO_DIR, 'revision-1')

    // After squash: should be 2 (initial + 1 squashed)
    const afterCount = sqGit('rev-list --count revision-1')
    expect(parseInt(afterCount, 10)).toBe(2)

    // Both spec files should still exist
    const files = sqGit('ls-tree -r --name-only revision-1 -- specs/')
    expect(files).toContain('SPEC-001.md')
    expect(files).toContain('SPEC-002.md')
  })
})

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('evolution-planner integration', () => {
  it('placeholder for integration test with real API', async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeTruthy()
  })
})
