# Spec-Driven Dark Factory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a platform where humans author specs via chat with AI, and autonomous agents implement them via TDD with code review.

**Architecture:** Nuxt 4 monorepo with Hasura/PostgreSQL backend, Bun runtime. AI agents use Anthropic SDK (ReAct pattern) with Claude Agent SDK as tools. Specs stored as markdown+frontmatter files in the project's git repo. K8s Agent Sandbox for agent isolation. Local dev via k3d + Tilt.

**Tech Stack:** Nuxt 4, Vue 3, Hasura v2 CE, PostgreSQL 16, Bun, URQL, Anthropic SDK, Claude Agent SDK, K8s Agent Sandbox CRD, k3d, Tilt, Drizzle ORM

**Reference:** See `docs/design.md` for full design document. See `../cc-board` for a similar project to reference for patterns (Nuxt+Hasura+Bun monorepo, agent orchestration, git worktree isolation, event-driven architecture).

---

## Task 1: Monorepo Scaffolding & Dev Environment

**Goal:** Set up the monorepo structure, build tooling, and local K8s dev environment so all subsequent tasks have a working foundation to build on.

**Files:**
- Create: `package.json` (workspace root)
- Create: `services/frontend/package.json`, `services/frontend/nuxt.config.ts`
- Create: `services/agent/package.json`, `services/agent/tsconfig.json`
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`
- Create: `Tiltfile`
- Create: `infra/k3d-config.yaml`
- Create: `deploy/helm/Chart.yaml`, `deploy/helm/values.yaml`
- Create: `deploy/helm/templates/` (PostgreSQL, Hasura, frontend, agent deployments)
- Create: `.gitignore`, `bunfig.toml`

**Steps:**

1. **Scaffold Bun monorepo** with three workspaces: `services/frontend`, `services/agent`, `packages/shared`. Reference cc-board's `package.json` for the workspace structure. Install core dependencies.

2. **Scaffold Nuxt 4 frontend** in `services/frontend/`. Minimal config with Tailwind CSS v4, URQL GraphQL client. Create a health-check page that renders "OK". Write a test that the Nuxt app starts and serves the health page.

3. **Scaffold agent service** in `services/agent/`. Bun + TypeScript. Create a minimal HTTP server with a `/health` endpoint. Write a test for the health endpoint.

4. **Set up shared package** in `packages/shared/`. Export shared TypeScript types (start with placeholder types for `Revision`, `EvolutionStep`, `SpecFile`). Write a test that types are importable.

5. **Set up Helm chart** in `deploy/helm/`. Define deployments for: PostgreSQL 16, Hasura v2 CE, frontend (Nuxt SSR), agent (Bun). Reference cc-board's `deploy/helm/` for structure. Include K8s Agent Sandbox CRD for agent sandboxing (with SandboxWarmPool).

6. **Set up Tilt + k3d** for local dev. `infra/k3d-config.yaml` for the local cluster. `Tiltfile` that builds and deploys all services. Verify `tilt up` brings up all services and health checks pass.

7. **Commit:** `feat: scaffold monorepo with Nuxt frontend, Bun agent service, and K8s dev environment`

---

## Task 2: Database Schema & Hasura Configuration

**Goal:** Set up the PostgreSQL schema via Drizzle ORM and configure Hasura to auto-generate the GraphQL API.

**Files:**
- Create: `services/frontend/server/database/schema.ts`
- Create: `services/frontend/server/database/migrate.ts`
- Create: `services/frontend/server/utils/db.ts`
- Create: `hasura/metadata/` (tables, permissions, relationships)
- Test: `services/frontend/tests/database/`

**Steps:**

1. **Write tests for the database schema** — test that migrations run cleanly, all tables exist with expected columns, and foreign key constraints work. Use a test database container.

2. **Implement Drizzle schema** with these tables (see `docs/design.md` data model section):
   - `users` (id, email, password_hash, name, created_at)
   - `projects` (id, name, git_url, ssh_private_key_encrypted, specs_path, current_revision, created_at)
   - `project_members` (project_id, user_id — M2M, no roles)
   - `revisions` (id, project_id, revision_number, status enum, branch_name, created_at, completed_at)
   - `evolution_steps` (id, revision_id, step_number, status enum, branch_name, spec_commit_hash, review_loop_count, review_summary)
   - `chat_messages` (id, revision_id, role enum, content, created_at)
   - `agent_threads` (id, project_id, agent_type, state JSONB, created_at, updated_at)

3. **Configure Hasura metadata** — track all tables, set up relationships (project → members, project → revisions, revision → steps, revision → messages). Set up role-based permissions (user role can read/write own projects via `x-hasura-user-id` header).

4. **Write migration runner** that runs on frontend startup (like cc-board's pattern).

5. **Commit:** `feat: database schema and Hasura GraphQL configuration`

---

## Task 3: Authentication

**Goal:** Email/password auth with session management.

**Files:**
- Create: `services/frontend/server/api/auth/register.post.ts`
- Create: `services/frontend/server/api/auth/login.post.ts`
- Create: `services/frontend/server/api/auth/logout.post.ts`
- Create: `services/frontend/server/api/auth/me.get.ts`
- Create: `services/frontend/server/utils/auth.ts` (password hashing, session management)
- Create: `services/frontend/app/pages/login.vue`
- Create: `services/frontend/app/pages/register.vue`
- Create: `services/frontend/app/middleware/auth.ts`
- Test: `services/frontend/tests/auth/`

**Steps:**

1. **Write tests for auth API endpoints** — register creates user, login returns session, logout invalidates, duplicate email rejected, invalid password rejected.

2. **Implement auth utilities** — bcrypt password hashing, encrypted session cookies (use `nuxt-auth-utils` or a simple cookie-based approach). Reference cc-board's `server/utils/auth.ts` for the session pattern.

3. **Implement API endpoints** — register, login, logout, me. The `me` endpoint returns current user from session cookie.

4. **Implement auth middleware** — Nuxt route middleware that redirects to `/login` if not authenticated.

5. **Build login/register pages** — simple forms, minimal styling with Tailwind. Handle errors.

6. **Commit:** `feat: email/password authentication with session management`

---

## Task 4: Project Management

**Goal:** CRUD for projects, link git repos via SSH key, multi-member support.

**Files:**
- Create: `services/frontend/app/pages/projects/index.vue` (project list)
- Create: `services/frontend/app/pages/projects/new.vue` (create project)
- Create: `services/frontend/app/pages/projects/[id]/` (project layout)
- Create: `services/frontend/app/composables/useProjects.ts`
- Create: `services/agent/src/git/clone.ts` (git clone via SSH)
- Create: `services/agent/src/git/operations.ts` (branch, commit, merge, tag)
- Create: `services/frontend/server/utils/crypto.ts` (SSH key encryption)
- Test: `services/agent/tests/git/`, `services/frontend/tests/projects/`

**Steps:**

1. **Write tests for git operations** — clone repo via SSH, create branch, commit files, merge branches, tag. Use a test git repo (can be a local bare repo for tests).

2. **Implement git operations module** in the agent service. Functions: `cloneRepo(url, sshKey, destPath)`, `createBranch(repo, name)`, `commitFiles(repo, files, message)`, `mergeBranch(repo, source, target)`, `tagRevision(repo, tag)`, `diffBranches(repo, base, head)`. All operations should work with SSH authentication.

3. **Write tests for project CRUD** — create project stores git URL + encrypted SSH key, list projects shows user's projects only, add/remove members.

4. **Implement SSH key encryption** — AES-GCM encrypt the SSH private key before storing in the database. Reference cc-board's `server/utils/crypto.ts`.

5. **Implement project pages** — project list (dashboard), create project form (name, git URL, SSH private key, specs path), project layout with navigation tabs for P1/P2/P3.

6. **Implement initial clone** — when a project is created, the agent service clones the repo. This should be triggered via a Hasura event trigger on project creation.

7. **Commit:** `feat: project management with git repo linking and SSH key support`

---

## Task 5: Spec File Parser & Shared Utilities

**Goal:** Build the core library for reading, writing, parsing, and diffing spec files (markdown + YAML frontmatter).

**Files:**
- Create: `packages/shared/src/specs/parser.ts` (parse spec files)
- Create: `packages/shared/src/specs/writer.ts` (serialize specs to markdown)
- Create: `packages/shared/src/specs/types.ts` (SpecFile, SpecMeta types)
- Create: `packages/shared/src/specs/diff.ts` (diff two spec sets)
- Create: `packages/shared/src/specs/index-builder.ts` (build in-memory relation graph)
- Test: `packages/shared/tests/specs/`

**Steps:**

1. **Write tests for spec parsing** — parse a markdown file with frontmatter, extract metadata (id, title, category, status, fulfillment, relations, tags), extract body. Handle malformed frontmatter gracefully. Test all fulfillment states.

2. **Implement spec parser** using `gray-matter` for frontmatter extraction. Define TypeScript types in `types.ts`. Validate frontmatter against a Zod schema.

3. **Write tests for spec writer** — serialize a SpecFile object back to markdown+frontmatter. Round-trip test: parse → write → parse should be identical.

4. **Implement spec writer** — serialize SpecMeta to YAML frontmatter, append markdown body.

5. **Write tests for spec diffing** — given two sets of specs, identify added/modified/removed specs. For modified specs, identify which fields changed.

6. **Implement spec diff** — compare two `SpecFile[]` arrays by ID. Return structured diff with change type and field-level changes for modified specs.

7. **Write tests for index builder** — given a set of specs with `depends_on` and `relates_to`, build an adjacency list. Query: "what does SPEC-001 depend on transitively?"

8. **Implement in-memory index builder** — scan all specs' frontmatter, build adjacency list, provide query functions (dependents, dependencies, related, transitive closure).

9. **Commit:** `feat: spec file parser, writer, differ, and relation index builder`

---

## Task 6: P1 — Spec Overview Page

**Goal:** Display current S1 specs from the main branch with fulfillment status and category grouping.

**Files:**
- Create: `services/frontend/app/pages/projects/[id]/specs.vue` (P1)
- Create: `services/frontend/app/components/specs/SpecCard.vue`
- Create: `services/frontend/app/components/specs/SpecGraph.vue`
- Create: `services/frontend/app/components/specs/FulfillmentBadge.vue`
- Create: `services/agent/src/api/specs.ts` (API to read specs from git)
- Create: `services/frontend/server/api/projects/[id]/specs.get.ts`
- Test: `services/frontend/tests/specs/`

**Steps:**

1. **Write tests for the spec reading API** — given a cloned repo with spec files, the API returns parsed specs from the main branch. Test category grouping and fulfillment status extraction.

2. **Implement spec reading API** in the agent service — read all files from the specs directory on main branch, parse each with the shared parser, return structured data. Expose via an HTTP endpoint that the frontend calls.

3. **Build the P1 page** — fetch specs from API, display grouped by category. Each spec shows as a card with title, fulfillment badge (red/yellow/green), category tag, and truncated description. Click to expand full spec. Add a simple graph visualization of spec relations (use a lightweight library like `vue-flow` or `d3-force`).

4. **Build FulfillmentBadge component** — red (unfulfilled), yellow (partial), green (fulfilled). Show tooltip with the AI's fulfillment explanation on hover.

5. **Commit:** `feat: P1 spec overview page with fulfillment status and category grouping`

---

## Task 7: Spec Drafter AI Agent

**Goal:** Build the ReAct agent that translates user chat into spec file changes on a draft branch.

**Files:**
- Create: `services/agent/src/agents/spec-drafter.ts`
- Create: `services/agent/src/agents/react-loop.ts` (shared ReAct agent loop)
- Create: `services/agent/src/tools/git-spec-tools.ts` (read/write/create/delete spec files)
- Create: `services/agent/src/prompts/spec-drafter.ts` (system prompt)
- Test: `services/agent/tests/agents/spec-drafter.test.ts`

**Steps:**

1. **Write tests for the ReAct loop** — given a system prompt and tools, the loop calls the Anthropic API, executes tool calls, and iterates until `end_turn`. Mock the Anthropic API for unit tests. Test tool execution, error handling, and max-step safety.

2. **Implement shared ReAct loop** — generic agent runner that takes a system prompt, tools, and messages, calls Anthropic API with `claude-sonnet-4-6`, executes tool calls, and loops. Reference cc-board's `orchestrator.ts` for the pattern. Include extended thinking.

3. **Write tests for git spec tools** — tools that read current specs from a branch, create/modify/delete spec files, commit changes. Test against a real test repo.

4. **Implement git spec tools** — `read_specs` (list and read all spec files on a branch), `write_spec` (create or update a spec file), `delete_spec` (remove a spec file), `commit_specs` (commit current changes with a message). Each tool works on the `revision-N` branch.

5. **Write tests for the Spec Drafter agent** — given user input like "add user authentication", the drafter creates appropriate spec files. Test that it creates a revision branch, commits spec changes, and responds conversationally.

6. **Implement Spec Drafter** — system prompt instructs the AI to: understand the user's intent, read current specs (S1), generate or modify spec files that capture the change, manage categories, and maintain spec relations. The agent works on the `revision-N` branch.

7. **Commit:** `feat: spec drafter ReAct agent with git-backed spec management`

---

## Task 8: P2 — Spec Drafting Page

**Goal:** Chat interface with S2 spec view for iterating on spec changes with the AI.

**Files:**
- Create: `services/frontend/app/pages/projects/[id]/draft.vue` (P2)
- Create: `services/frontend/app/components/draft/ChatPanel.vue`
- Create: `services/frontend/app/components/draft/SpecDraftPanel.vue`
- Create: `services/frontend/app/components/draft/RestructureMetric.vue`
- Create: `services/frontend/server/api/projects/[id]/chat.post.ts`
- Create: `services/frontend/server/api/projects/[id]/draft-specs.get.ts`
- Test: `services/frontend/tests/draft/`

**Steps:**

1. **Write tests for the chat API** — posting a message stores it, triggers the Spec Drafter agent, and returns the AI's response. Test that spec files on the draft branch are updated.

2. **Implement chat API** — POST endpoint receives user message, stores in `chat_messages`, invokes the Spec Drafter agent, stores AI response, returns it. Use Hasura event trigger or direct API call to the agent service.

3. **Build the P2 page** — two-column layout. Left: chat panel with message history and input. Right: current S2 spec view (specs from the `revision-N` branch), with change indicators (new/modified badges). The right panel refreshes after each AI response.

4. **Build ChatPanel component** — message list with user/assistant styling, text input with submit. Support markdown rendering in AI responses.

5. **Build SpecDraftPanel component** — list of specs from the draft branch. New specs highlighted. Modified specs show a "modified" badge. Click to view full spec content.

6. **Build RestructureMetric component** — displays the AI's restructuring recommendation score (computed during drafting). Button to trigger restructuring (which is just another message to the Spec Drafter).

7. **Commit:** `feat: P2 spec drafting page with chat and live spec preview`

---

## Task 9: P3 — Diff View & Approval

**Goal:** Show the diff between S1 and S2, allow approval to trigger implementation.

**Files:**
- Create: `services/frontend/app/pages/projects/[id]/review.vue` (P3)
- Create: `services/frontend/app/components/review/SpecDiff.vue`
- Create: `services/frontend/app/components/review/ImplementationStatus.vue`
- Create: `services/frontend/server/api/projects/[id]/approve.post.ts`
- Create: `services/frontend/server/api/projects/[id]/revision-status.get.ts`
- Test: `services/frontend/tests/review/`

**Steps:**

1. **Write tests for the diff API** — given specs on main and specs on a revision branch, return a structured diff (added/modified/removed specs with field-level changes).

2. **Implement diff API** — read specs from both branches using the shared parser and differ. Return structured diff data.

3. **Write tests for the approve endpoint** — approving squashes spec commits on the revision branch, sets revision status to `approved`, triggers the evolution planner.

4. **Implement approve endpoint** — squash commits on `revision-N` branch, update revision status in DB, trigger evolution planning (via event or direct call).

5. **Build the P3 page** — show spec diff (added in green, removed in red, modified with inline changes). Approve button at the bottom. After approval, switch to showing implementation status.

6. **Build SpecDiff component** — render the structured diff. Per-spec cards showing change type and field-level diffs. Use a side-by-side or unified diff rendering for spec body changes.

7. **Build ImplementationStatus component** — shows: current evolution step (N of M), current phase (implementing/reviewing), current loop count, brief review summary when a loop restarts. This should poll or use GraphQL subscriptions for live updates.

8. **Commit:** `feat: P3 diff view with approval and implementation status`

---

## Task 10: Evolution Planner Agent

**Goal:** AI agent that decomposes the S1→S2 spec diff into sequential evolution steps.

**Files:**
- Create: `services/agent/src/agents/evolution-planner.ts`
- Create: `services/agent/src/prompts/evolution-planner.ts`
- Test: `services/agent/tests/agents/evolution-planner.test.ts`

**Steps:**

1. **Write tests for the Evolution Planner** — given a spec diff (added/modified/removed specs), the planner generates a sequence of evolution steps. Each step has: a subset of spec changes, a description, and the step creates a branch with the spec changes committed. Test that the steps form a valid path from S1 to S2 (applying all steps' changes yields S2). Test that steps are not too granular (code review is expensive).

2. **Implement the Evolution Planner** — ReAct agent with a system prompt that instructs it to: analyze the spec diff, consider dependencies between specs, group related changes into steps, create branches and commit spec changes for each step. The planner should err on the side of fewer, larger steps since each step triggers an expensive review cycle.

3. **Implement the step creation flow** — for each evolution step: create `revision-N/step-M` branch from `revision-N`, commit the step's spec changes, record the step in the `evolution_steps` table with the commit hash.

4. **Commit:** `feat: evolution planner agent decomposes spec diffs into implementation steps`

---

## Task 11: Implementation Orchestrator & Code Review

**Goal:** The core implementation pipeline — a ReAct agent that drives TDD implementation per evolution step, with code review as a sub-tool.

**Files:**
- Create: `services/agent/src/agents/implementation-orchestrator.ts`
- Create: `services/agent/src/agents/code-reviewer.ts`
- Create: `services/agent/src/tools/claude-code-tool.ts` (wraps Claude Agent SDK as a tool)
- Create: `services/agent/src/tools/review-tool.ts` (wraps code reviewer as a tool)
- Create: `services/agent/src/prompts/implementation-orchestrator.ts`
- Create: `services/agent/src/prompts/code-reviewer.ts`
- Create: `services/agent/src/worker/sandbox.ts` (K8s Agent Sandbox management)
- Test: `services/agent/tests/agents/implementation-orchestrator.test.ts`
- Test: `services/agent/tests/agents/code-reviewer.test.ts`

**Steps:**

1. **Write tests for the Claude Code tool wrapper** — wraps the Claude Agent SDK to be callable as a ReAct tool. Test that it receives a prompt, executes in a sandbox, and returns results. Mock the Agent SDK for unit tests.

2. **Implement Claude Code tool** — creates a Claude Agent SDK session with `--bare` mode, restricted to a working directory (the repo clone), passes the implementation prompt, returns the result. Configure permissions, timeout, and budget limits.

3. **Write tests for K8s Sandbox management** — create a sandbox, wait for ready, execute a command, destroy. Test warm pool usage.

4. **Implement K8s Sandbox management** — use the Agent Sandbox CRD API to create/manage sandboxes for implementation workers. Each evolution step gets its own sandbox. Use the SandboxWarmPool for fast startup.

5. **Write tests for the Code Reviewer** — given spec files and code changes (as a git diff), the reviewer evaluates whether the specs are fulfilled. Test that it returns a structured verdict (pass/fail + explanation).

6. **Implement Code Reviewer** — ReAct agent that receives the spec commit hash and the implementation diff. Uses Claude Code SDK as a tool to read and analyze the source code. System prompt instructs it to check each spec's acceptance criteria against the implementation. Returns structured verdict.

7. **Write tests for the Implementation Orchestrator** — given an evolution step (spec diff commit hash), the orchestrator: calls Claude Code to implement via TDD, calls the reviewer, loops if review fails (max 3), updates step status. Test the full loop including retry.

8. **Implement the Implementation Orchestrator** — ReAct agent with tools: `claude_code` (implementation), `code_review` (reviewer sub-agent), `git_commit`, `git_push`. System prompt instructs it to:
   - Diff the spec commit to understand what to implement
   - Call Claude Code with TDD instructions (red → green → refactor)
   - After implementation, call the code reviewer
   - If review fails, call Claude Code again with the review feedback
   - Max 3 review loops
   - On success, merge the step branch into the revision branch

9. **Implement the pipeline runner** — sequentially executes all evolution steps for a revision. Updates step status in DB. On completion of all steps, merge `revision-N` into `main`, tag with revision number, update revision status.

10. **Commit:** `feat: implementation orchestrator with TDD, code review loops, and K8s sandboxing`

---

## Task 12: Fulfillment Auditor Agent

**Goal:** After implementation completes, audit all specs and update their fulfillment status.

**Files:**
- Create: `services/agent/src/agents/fulfillment-auditor.ts`
- Create: `services/agent/src/prompts/fulfillment-auditor.ts`
- Test: `services/agent/tests/agents/fulfillment-auditor.test.ts`

**Steps:**

1. **Write tests for the Fulfillment Auditor** — given a set of specs and a codebase, the auditor updates each spec's `fulfillment` field and `fulfillment_explanation`. Test that it correctly identifies fulfilled, partial, and unfulfilled specs.

2. **Implement the Fulfillment Auditor** — ReAct agent that iterates over all specs on main. For each spec, uses Claude Code SDK to analyze the codebase against the spec's acceptance criteria. Updates the spec's frontmatter with the fulfillment enum and explanation. Commits the updated specs.

3. **Wire into the pipeline** — the auditor runs after all evolution steps complete, before the final merge to main (or immediately after). Spec fulfillment updates are committed to the revision branch.

4. **Commit:** `feat: fulfillment auditor updates spec status after implementation`

---

## Task 13: Codebase Analyzer (Project Onboarding)

**Goal:** When a new project is created, AI analyzes existing code and generates initial S1 specs.

**Files:**
- Create: `services/agent/src/agents/codebase-analyzer.ts`
- Create: `services/agent/src/prompts/codebase-analyzer.ts`
- Test: `services/agent/tests/agents/codebase-analyzer.test.ts`

**Steps:**

1. **Write tests for the Codebase Analyzer** — given a repo with existing code, the analyzer generates spec files that describe the current system. Test that it creates reasonable categories and specs for a sample project.

2. **Implement the Codebase Analyzer** — ReAct agent that uses Claude Code SDK to explore the codebase (read files, understand structure, identify features). Generates spec files with appropriate categories, relations, and fulfillment status (all "fulfilled" since the code already exists). Creates the specs directory, commits specs to main.

3. **Wire into project creation** — after the initial clone, trigger the codebase analyzer. Set project status to "analyzing" during this phase.

4. **Commit:** `feat: codebase analyzer generates initial specs for existing projects`

---

## Task 14: Interruption Handling

**Goal:** Allow users to interrupt a running implementation with three rollback options.

**Files:**
- Create: `services/frontend/server/api/projects/[id]/interrupt.post.ts`
- Create: `services/frontend/app/components/review/InterruptDialog.vue`
- Modify: `services/agent/src/agents/implementation-orchestrator.ts` (add abort handling)
- Test: `services/frontend/tests/interrupt/`

**Steps:**

1. **Write tests for interruption** — test each of the three options:
   - Keep partial: completed steps stay, remaining specs become unstaged S2
   - Rollback: revert to old S1, full S2 as unapproved edit
   - Discard: throw away S2 entirely

2. **Implement abort mechanism** — the implementation orchestrator checks for an abort flag between steps. On abort, it stops cleanly after completing (or rolling back) the current step.

3. **Implement the three rollback options** as git operations:
   - Keep partial: merge completed steps into main, create new draft branch with remaining spec diff
   - Rollback: delete the revision branch changes, keep the spec diff as a new draft
   - Discard: delete the revision branch entirely

4. **Build InterruptDialog** — modal with three options, triggered from the ImplementationStatus component. Shows which steps are completed vs pending.

5. **Commit:** `feat: implementation interruption with partial keep, rollback, and discard options`

---

## Task 15: Concurrent S3 Drafting

**Goal:** Allow drafting S3 while S2 is being implemented. S3 queues behind S2 for implementation.

**Files:**
- Modify: `services/frontend/app/pages/projects/[id]/draft.vue` (handle concurrent drafting)
- Modify: `services/agent/src/agents/spec-drafter.ts` (base S3 on S2)
- Modify: `services/frontend/server/api/projects/[id]/approve.post.ts` (queue implementation)
- Test: `services/frontend/tests/concurrent-drafting/`

**Steps:**

1. **Write tests for concurrent drafting** — while a revision is implementing, a new revision can be drafted. The new revision's draft branch is based on the implementing revision's branch (assumes S2 is fully implemented). Approving S3 queues it; it starts implementing only after S2 completes.

2. **Implement queuing logic** — the revision table already has status tracking. When S3 is approved while S2 is implementing, S3 enters `approved` status but implementation waits until S2 is `completed`. A background poller or event checks for queued revisions.

3. **Update the draft page** — show a banner when an implementation is running ("S2 is being implemented, you're drafting S3"). The spec drafter reads specs from the revision branch of the implementing revision (S2), not from main.

4. **Commit:** `feat: concurrent spec drafting while implementation runs`

---

## Task 16: Spec Restructuring Recommendations

**Goal:** AI evaluates spec graph health and recommends restructuring, triggerable from P2.

**Files:**
- Create: `services/agent/src/agents/spec-restructurer.ts`
- Create: `services/agent/src/prompts/spec-restructurer.ts`
- Modify: `services/frontend/app/components/draft/RestructureMetric.vue` (wire to real data)
- Test: `services/agent/tests/agents/spec-restructurer.test.ts`

**Steps:**

1. **Write tests for restructuring evaluation** — given a set of specs, the restructurer returns a score (0-100) for how much it recommends restructuring, with reasoning.

2. **Implement the Spec Restructurer** — ReAct agent that evaluates: category coherence, relation graph health (orphans, cycles, imbalanced trees), spec granularity consistency, naming conventions. Returns a restructuring score and explanation.

3. **Implement restructuring execution** — when triggered, the restructurer rewrites spec files (recategorize, rename, split, merge, update relations) on the draft branch. Uses the same S2 drafting flow since it's just spec changes.

4. **Wire into P2** — the RestructureMetric component shows the score and a "Restructure" button. Clicking triggers the restructurer, which modifies specs on the draft branch.

5. **Commit:** `feat: AI-driven spec restructuring recommendations and execution`

---

## Task 17: Real-Time Implementation Status

**Goal:** Live updates on the P3 page showing implementation progress.

**Files:**
- Modify: `services/frontend/app/components/review/ImplementationStatus.vue`
- Create: `hasura/metadata/subscriptions/` (GraphQL subscriptions for status)
- Modify: `services/agent/src/agents/implementation-orchestrator.ts` (emit status updates)
- Test: `services/frontend/tests/status/`

**Steps:**

1. **Set up Hasura GraphQL subscriptions** for `evolution_steps` status changes and `revisions` status changes.

2. **Update Implementation Orchestrator** to update `evolution_steps` status in the database at each phase transition (pending → implementing → reviewing → completed). Store brief review summaries when a loop restarts.

3. **Enhance ImplementationStatus component** — subscribe to evolution step updates via GraphQL subscriptions. Show: progress bar (step N of M), current phase badge, loop counter, and brief review feedback when a loop restarts.

4. **Commit:** `feat: real-time implementation status via GraphQL subscriptions`

---

## Execution Notes

- **Reference cc-board extensively** (`../cc-board`) for patterns: Nuxt+Hasura wiring, Drizzle migrations, Tilt/k3d setup, agent orchestration, git operations, crypto utilities, GraphQL subscriptions.
- **Every task follows TDD:** write failing test → implement → verify tests pass → commit.
- **Specs are NOT in the database.** They are files in the git repo. The database tracks workflow state only.
- **Git is the source of truth for specs and code.** The platform is a workflow layer on top of git.
- **Agent sandboxing via K8s Agent Sandbox CRD** — research the API if unfamiliar. Fall back to simpler pod-based isolation if the CRD is not yet stable enough.
- **All AI agents use the shared ReAct loop** (`react-loop.ts`). Each agent differs only in system prompt and available tools.
- **Claude Agent SDK requires the Claude Code binary.** Ensure it's available in the agent container image.
