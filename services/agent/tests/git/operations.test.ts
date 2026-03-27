import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import {
  cloneRepo,
  createBranch,
  checkoutBranch,
  commitFiles,
  getCommitHash,
  getCurrentBranch,
  diffBranches,
  mergeBranch,
  tagRevision,
} from '../../src/git/operations'

const TEST_DIR = join('/tmp', `git-ops-test-${Date.now()}`)
const BARE_REPO = join(TEST_DIR, 'bare.git')
const WORK_REPO = join(TEST_DIR, 'work')
const CLONE_DEST = join(TEST_DIR, 'cloned')

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8' }).trim()
}

describe('git operations', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true })

    // Create a bare repo
    mkdirSync(BARE_REPO)
    git(BARE_REPO, 'init --bare')

    // Create a working clone and push an initial commit
    git(TEST_DIR, `clone ${BARE_REPO} work`)
    git(WORK_REPO, 'config user.email "test@example.com"')
    git(WORK_REPO, 'config user.name "Test User"')
    writeFileSync(join(WORK_REPO, 'README.md'), '# Test Repo\n')
    git(WORK_REPO, 'add README.md')
    git(WORK_REPO, 'commit -m "Initial commit"')
    git(WORK_REPO, 'push origin HEAD')
  })

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('cloneRepo clones from a local bare repo', async () => {
    // Use a dummy ssh key path — local clone won't use it but the function requires it
    const dummyKeyPath = join(TEST_DIR, 'dummy_key')
    writeFileSync(dummyKeyPath, '', { mode: 0o600 })

    // For local clone, override the url to use file:// protocol
    // cloneRepo uses GIT_SSH_COMMAND but file:// clones ignore it
    await cloneRepo(`file://${BARE_REPO}`, dummyKeyPath, CLONE_DEST)

    expect(existsSync(join(CLONE_DEST, '.git'))).toBe(true)
    expect(existsSync(join(CLONE_DEST, 'README.md'))).toBe(true)
  })

  it('getCurrentBranch returns the current branch name', async () => {
    const branch = await getCurrentBranch(WORK_REPO)
    // Could be 'main' or 'master' depending on git config
    expect(['main', 'master']).toContain(branch)
  })

  it('getCommitHash returns a valid hash', async () => {
    const hash = await getCommitHash(WORK_REPO)
    expect(hash).toMatch(/^[0-9a-f]{40}$/)
  })

  it('getCommitHash with ref returns correct hash', async () => {
    const hash = await getCommitHash(WORK_REPO, 'HEAD')
    expect(hash).toMatch(/^[0-9a-f]{40}$/)
  })

  it('createBranch creates a new branch', async () => {
    await createBranch(WORK_REPO, 'feature-a')
    const branches = git(WORK_REPO, 'branch --list').split('\n').map(b => b.trim().replace('* ', ''))
    expect(branches).toContain('feature-a')
  })

  it('checkoutBranch switches to the branch', async () => {
    await checkoutBranch(WORK_REPO, 'feature-a')
    const current = await getCurrentBranch(WORK_REPO)
    expect(current).toBe('feature-a')
  })

  it('commitFiles creates a commit and returns the hash', async () => {
    writeFileSync(join(WORK_REPO, 'new-file.txt'), 'hello world\n')
    const hash = await commitFiles(WORK_REPO, ['new-file.txt'], 'Add new file')
    expect(hash).toMatch(/^[0-9a-f]{40}$/)

    // Verify the commit exists
    const log = git(WORK_REPO, 'log --oneline -1')
    expect(log).toContain('Add new file')
  })

  it('diffBranches shows changes between branches', async () => {
    const diff = await diffBranches(WORK_REPO, 'master', 'feature-a')
    expect(diff).toContain('new-file.txt')
    expect(diff).toContain('hello world')
  })

  it('mergeBranch merges source into target', async () => {
    const mainBranch = 'master'

    await mergeBranch(WORK_REPO, 'feature-a', mainBranch)

    // Now on main/master, verify file exists
    const current = await getCurrentBranch(WORK_REPO)
    expect(current).toBe(mainBranch)
    expect(existsSync(join(WORK_REPO, 'new-file.txt'))).toBe(true)
  })

  it('tagRevision creates a tag', async () => {
    await tagRevision(WORK_REPO, 'v1.0.0', 'Release 1.0.0')
    const tags = git(WORK_REPO, 'tag --list').split('\n').map(t => t.trim())
    expect(tags).toContain('v1.0.0')
  })

  it('tagRevision creates a lightweight tag without message', async () => {
    await tagRevision(WORK_REPO, 'v1.0.1')
    const tags = git(WORK_REPO, 'tag --list').split('\n').map(t => t.trim())
    expect(tags).toContain('v1.0.1')
  })
})
