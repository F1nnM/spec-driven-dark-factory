import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { encrypt, decrypt } from '../../server/utils/crypto'
import { randomBytes } from 'node:crypto'

const migrationPath = resolve(__dirname, '../../server/database/migrations/0000_mushy_edwin_jarvis.sql')

describe('database schema', () => {
  let pg: InstanceType<typeof PGlite>

  beforeAll(async () => {
    pg = new PGlite()

    // Run the migration SQL, splitting on drizzle's statement breakpoints
    const sql = readFileSync(migrationPath, 'utf-8')
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
    for (const stmt of statements) {
      await pg.exec(stmt)
    }
  })

  afterAll(async () => {
    await pg.close()
  })

  it('creates all tables', async () => {
    const result = await pg.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)
    const tableNames = result.rows.map((r: any) => r.table_name).sort()
    expect(tableNames).toEqual([
      'agent_threads',
      'chat_messages',
      'evolution_steps',
      'project_members',
      'projects',
      'revisions',
      'users',
    ])
  })

  it('creates revision_status enum with correct values', async () => {
    const result = await pg.query(`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'revision_status'
      ORDER BY enumsortorder
    `)
    expect(result.rows.map((r: any) => r.enumlabel)).toEqual([
      'drafting', 'approved', 'implementing', 'completed', 'interrupted',
    ])
  })

  it('creates evolution_step_status enum with correct values', async () => {
    const result = await pg.query(`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'evolution_step_status'
      ORDER BY enumsortorder
    `)
    expect(result.rows.map((r: any) => r.enumlabel)).toEqual([
      'pending', 'implementing', 'reviewing', 'completed', 'failed',
    ])
  })

  it('creates chat_role enum with correct values', async () => {
    const result = await pg.query(`
      SELECT enumlabel FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'chat_role'
      ORDER BY enumsortorder
    `)
    expect(result.rows.map((r: any) => r.enumlabel)).toEqual(['user', 'assistant'])
  })

  it('enforces foreign key from revisions to projects', async () => {
    // Insert a project first
    await pg.exec(`
      INSERT INTO users (id, email, password_hash, name)
      VALUES ('00000000-0000-0000-0000-000000000001', 'test@test.com', 'hash', 'Test')
    `)
    await pg.exec(`
      INSERT INTO projects (id, name, git_url)
      VALUES ('00000000-0000-0000-0000-000000000010', 'proj', 'git@example.com:repo.git')
    `)

    // Should succeed: valid project_id
    await pg.exec(`
      INSERT INTO revisions (id, project_id, revision_number, status, branch_name)
      VALUES ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 1, 'drafting', 'rev-1')
    `)

    // Should fail: invalid project_id
    await expect(pg.exec(`
      INSERT INTO revisions (id, project_id, revision_number, status, branch_name)
      VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-ffffffffff00', 2, 'drafting', 'rev-2')
    `)).rejects.toThrow()
  })

  it('enforces foreign key from project_members to users and projects', async () => {
    // Should succeed with existing user and project
    await pg.exec(`
      INSERT INTO project_members (project_id, user_id)
      VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001')
    `)

    // Should fail with non-existent user
    await expect(pg.exec(`
      INSERT INTO project_members (project_id, user_id)
      VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-ffffffffffff')
    `)).rejects.toThrow()
  })

  it('cascade deletes revisions when project is deleted', async () => {
    const before = await pg.query(`SELECT count(*) as cnt FROM revisions WHERE project_id = '00000000-0000-0000-0000-000000000010'`)
    expect(Number((before.rows[0] as any).cnt)).toBeGreaterThan(0)

    await pg.exec(`DELETE FROM projects WHERE id = '00000000-0000-0000-0000-000000000010'`)

    const after = await pg.query(`SELECT count(*) as cnt FROM revisions WHERE project_id = '00000000-0000-0000-0000-000000000010'`)
    expect(Number((after.rows[0] as any).cnt)).toBe(0)
  })

  it('enforces unique email constraint on users', async () => {
    await expect(pg.exec(`
      INSERT INTO users (id, email, password_hash, name)
      VALUES ('00000000-0000-0000-0000-000000000002', 'test@test.com', 'hash2', 'Duplicate')
    `)).rejects.toThrow()
  })
})

describe('crypto utils', () => {
  const hexKey = randomBytes(32).toString('hex')

  it('encrypts and decrypts a string round-trip', () => {
    const plaintext = 'ssh-rsa AAAAB3... this is a secret SSH key'
    const encrypted = encrypt(plaintext, hexKey)
    expect(encrypted).not.toEqual(plaintext)
    const decrypted = decrypt(encrypted, hexKey)
    expect(decrypted).toEqual(plaintext)
  })

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const plaintext = 'same input'
    const a = encrypt(plaintext, hexKey)
    const b = encrypt(plaintext, hexKey)
    expect(a).not.toEqual(b)
    expect(decrypt(a, hexKey)).toEqual(plaintext)
    expect(decrypt(b, hexKey)).toEqual(plaintext)
  })

  it('fails to decrypt with wrong key', () => {
    const encrypted = encrypt('secret', hexKey)
    const wrongKey = randomBytes(32).toString('hex')
    expect(() => decrypt(encrypted, wrongKey)).toThrow()
  })
})
