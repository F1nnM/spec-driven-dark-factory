import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// Enums
export const revisionStatusEnum = pgEnum('revision_status', [
  'drafting',
  'approved',
  'implementing',
  'completed',
  'interrupted',
])

export const evolutionStepStatusEnum = pgEnum('evolution_step_status', [
  'pending',
  'implementing',
  'reviewing',
  'completed',
  'failed',
])

export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant'])

// Tables
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: integer('github_id').unique().notNull(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  encryptedGithubToken: text('encrypted_github_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  gitUrl: text('git_url').notNull(),
  sshPrivateKeyEncrypted: text('ssh_private_key_encrypted'),
  gitTokenUserId: uuid('git_token_user_id').references(() => users.id, { onDelete: 'set null' }),
  specsPath: text('specs_path').notNull().default('/specs'),
  currentRevision: integer('current_revision').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  table => [primaryKey({ columns: [table.projectId, table.userId] })],
)

export const revisions = pgTable('revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  revisionNumber: integer('revision_number').notNull(),
  status: revisionStatusEnum('status').notNull(),
  branchName: text('branch_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

export const evolutionSteps = pgTable('evolution_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  revisionId: uuid('revision_id')
    .notNull()
    .references(() => revisions.id, { onDelete: 'cascade' }),
  stepNumber: integer('step_number').notNull(),
  status: evolutionStepStatusEnum('status').notNull(),
  branchName: text('branch_name').notNull(),
  specCommitHash: text('spec_commit_hash'),
  reviewLoopCount: integer('review_loop_count').default(0),
  reviewSummary: text('review_summary'),
})

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  revisionId: uuid('revision_id')
    .notNull()
    .references(() => revisions.id, { onDelete: 'cascade' }),
  role: chatRoleEnum('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const agentThreads = pgTable('agent_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  agentType: text('agent_type').notNull(),
  state: jsonb('state').default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
