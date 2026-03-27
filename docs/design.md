# Spec-Driven Dark Factory: Design Document

## Vision

A platform where humans author specifications via chat with AI, and autonomous agents implement them using TDD with code review. Specs are the persistent, evolving artifact. Humans supervise concepts, not implementation.

## Core Concepts

### Specifications

Specs are markdown files with YAML frontmatter, stored in the project's git repo (default path: `/specs`). They are the single source of truth for what the software should do.

**Format:**

```markdown
---
id: SPEC-001
title: User Authentication
category: security
status: draft | approved | implemented | deprecated
fulfillment: unfulfilled | partial | fulfilled
fulfillment_explanation: "OAuth flow implemented, but session expiry not yet enforced"
depends_on: [SPEC-003, SPEC-012]
relates_to: [SPEC-005]
tags: [auth, oauth]
created: 2026-03-26
updated: 2026-03-26
---

## Overview
The system shall authenticate users via OAuth 2.0...

## Acceptance Criteria
- Users can log in with Google
- Session expires after 30 minutes of inactivity
```

**Properties:**
- **Categories** are dynamic, AI-managed per project (e.g., functional, non-functional, architecture, testing, stack constraints). Users cannot edit categories directly.
- **Relations** (`depends_on`, `relates_to`) are expressed in frontmatter. An in-memory index is built at read time for graph queries. No graph database needed.
- **Fulfillment** is a three-state enum (unfulfilled/partial/fulfilled) with a freetext AI explanation. Updated by the Fulfillment Auditor agent after implementation.
- **One file per spec.** Filename format: `SPEC-NNN-slug.md`.

### Spec Lifecycle

```
S1 (current, on main) ── user describes change ── AI drafts S2 (on revision-N branch)
                                                        │
                                                   user + AI iterate via chat
                                                        │
                                                   user approves S2
                                                        │
                                              AI generates evolution steps
                                                        │
                                              sequential implementation
                                              (TDD + code review per step)
                                                        │
                                              merge revision-N → main
                                              auto-tag with revision N
```

While S2 is implementing, the user can draft S3. S3 assumes S2 is fully implemented. S3 implementation queues behind S2.

### Git Branching Model

```
main ──────────────────────────────────────────── (stable, tagged releases)
  └── revision-1 ──────────────────────────────── (spec changes squashed on approve)
        ├── revision-1/step-1 ──── merge into revision-1
        ├── revision-1/step-2 ──── merge into revision-1
        └── revision-1/step-3 ──── merge into revision-1
                                        └── merge revision-1 → main, tag v1
```

- **Draft phase:** AI commits spec changes to `revision-N` branch as the user iterates. On approval, these are squashed into a single spec commit.
- **Implementation phase:** Each evolution step gets a branch `revision-N/step-M`. The step starts with a commit containing the spec changes for that step (the contract). Implementation code follows via TDD. Once the step passes review, its branch merges into `revision-N`.
- **Completion:** When all steps are done, `revision-N` merges into `main` with a linear history. Auto-tagged with the revision number.

### Evolution Steps

When the user approves S2, the AI decomposes the spec diff (S1 → S2) into sequential evolution steps. Each step is an intermediate spec state between S1 and S2. Steps are implemented sequentially — no parallelism.

Each step's spec changes are committed first, forming the "contract" for the Implementation Orchestrator. The orchestrator receives the git commit hashes and diffs them to know what to implement.

### Implementation Pipeline (Per Evolution Step)

```
Implementation Orchestrator (ReAct agent)
├── tool: Claude Code SDK  → writes code (TDD: red → green → refactor)
├── tool: Code Reviewer    → audits changes against specs
│   └── tool: Claude Code SDK  → reads/analyzes source code
└── tool: Git operations   → commits, branch management
```

1. Create branch `revision-N/step-M`
2. Commit spec changes for this step
3. Implementation Orchestrator receives spec diff commit hashes
4. Orchestrator calls Claude Code to implement (TDD)
5. Orchestrator calls Code Reviewer to audit against specs
6. If review fails → loop (max 3 iterations)
7. Merge step branch into `revision-N`

### Fulfillment Auditing

```
Fulfillment Auditor (ReAct agent)
└── tool: Claude Code SDK  → analyzes codebase against spec criteria
```

After implementation completes (or on demand), the Fulfillment Auditor:
- Reads each spec's acceptance criteria
- Uses Claude Code to analyze the codebase
- Updates the `fulfillment` enum and `fulfillment_explanation` in each spec's frontmatter
- Commits the updated specs

### Interruption Handling

Users can interrupt a running implementation. Three options:

1. **Keep partial:** Choose a completed evolution step. Its result becomes the new S1. The remaining unimplemented spec diff automatically becomes unstaged S2.
2. **Rollback:** Revert to old S1. Full S2 remains as an unapproved edit.
3. **Discard:** Throw away S2 entirely.

### Spec Restructuring

The AI evaluates the health of the spec graph (categories, relations, structure) and provides a recommendation metric visible in the P2 drafting UI. Users can trigger restructuring from there — it uses the same S2 drafting flow, since restructuring is just spec changes that don't change meaning (zero or near-zero evolution path).

## Pages

### P1: Spec Overview
- Displays current S1 specs from `main` branch
- Fulfillment status per spec (red/yellow/green for unfulfilled/partial/fulfilled)
- AI-managed categories as grouping/filtering
- Spec graph visualization (relations)
- Read-only view of the current state

### P2: Spec Drafting
- Two-column layout: chat (left) + S2 spec view (right)
- User describes changes in chat, AI translates to spec file changes on the `revision-N` branch
- S2 view shows current draft specs with change indicators
- Restructuring recommendation metric visible
- Button to trigger restructuring (same flow as drafting)

### P3: Diff & Approve
- Git diff of spec files between S1 (main) and S2 (revision-N branch)
- Added / modified / removed specs clearly shown
- Approve button triggers implementation pipeline
- Implementation status view (which step, which phase, which loop, brief review summaries)

## Agent Architecture

| Agent | Type | Engine | Tools |
|-------|------|--------|-------|
| **Spec Drafter** | ReAct | Anthropic SDK | Git ops (read/write spec files on branch) |
| **Codebase Analyzer** | ReAct | Anthropic SDK | Claude Code SDK (analyze existing code) |
| **Evolution Planner** | ReAct | Anthropic SDK | Git ops (read spec diffs, create step branches) |
| **Implementation Orchestrator** | ReAct | Anthropic SDK | Claude Code SDK, Code Reviewer, Git ops |
| **Code Reviewer** | ReAct (sub-agent) | Anthropic SDK | Claude Code SDK (read/analyze code) |
| **Fulfillment Auditor** | ReAct | Anthropic SDK | Claude Code SDK (analyze code against specs) |
| **Spec Restructurer** | ReAct | Anthropic SDK | Git ops (rewrite spec files) |

Key principle: **Claude Code SDK is always the "hands"** (reads/writes code). **ReAct agents are always the "brain"** (decides what to do, evaluates results).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Nuxt 4 (Vue 3 + Nitro SSR) |
| **API** | Hasura v2 CE (auto-generated GraphQL from DB) |
| **Database** | PostgreSQL 16 |
| **GraphQL Client** | URQL with Graphcache |
| **Runtime** | Bun |
| **AI Implementation** | Claude Agent SDK (subagents for code work) |
| **AI Orchestration** | ReAct agents (Anthropic SDK + tool definitions) |
| **Agent Sandboxing** | K8s Agent Sandbox CRD (gVisor, warm pools) |
| **Local Dev** | k3d + Tilt |
| **Auth** | Email/password (simple, no OAuth) |
| **Monorepo** | Bun workspaces |

## Data Model (PostgreSQL)

```
users
  id, email, password_hash, name, created_at

projects
  id, name, git_url, ssh_private_key (encrypted), specs_path (default "/specs"),
  current_revision, created_at

project_members
  project_id, user_id (M2M, no roles)

revisions
  id, project_id, revision_number, status (drafting|approved|implementing|completed|interrupted),
  branch_name, created_at, completed_at

evolution_steps
  id, revision_id, step_number, status (pending|implementing|reviewing|completed|failed),
  branch_name, spec_commit_hash, review_loop_count, review_summary

chat_messages
  id, revision_id, role (user|assistant), content, created_at

agent_threads
  id, project_id, agent_type, state (JSONB), created_at, updated_at
```

Specs themselves are NOT in the database — they live as files in the git repo. The database tracks workflow state (revisions, steps, chat) while git tracks content (specs, code).

## Project Setup Flow

1. User creates project, provides git URL + SSH key
2. Platform clones repo server-side
3. Codebase Analyzer agent scans existing code
4. AI generates initial S1 specs in `/specs` directory
5. Commits specs to `main` branch
6. Project is ready for drafting
