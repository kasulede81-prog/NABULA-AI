# Phase 2 — Agents Complete

**Date:** 2026-06-06  
**Scope:** Clarifier + Builder agents, Claude integration, spec generation, VFS file generation, build retry loop, SSE progress

**Not implemented (by design):** Preview, GitHub, Stripe, multi-model, deployment, teams, templates, task boards, additional agents.

---

## Architecture Changes

### Agent Pipeline

```
User creates project
       │
       ▼
┌──────────────┐     questions (1–3)     ┌──────────────┐
│  Clarifier   │ ──────────────────────► │  clarifying  │
│   Agent      │                         │   (status)   │
└──────────────┘                         └──────┬───────┘
       │ spec_json ready                        │ user answers
       ▼                                        ▼
┌──────────────┐                         ┌──────────────┐
│  spec_json   │ ◄───────────────────────│  Clarifier   │
│  in project  │                         │  (force)     │
└──────┬───────┘                         └──────────────┘
       │
       ▼
┌──────────────┐   tool loop (≤30 calls)  ┌──────────────┐
│   Builder    │ ───────────────────────► │   building   │
│   Agent      │   write/read/list/delete │   (status)   │
└──────────────┘                         └──────┬───────┘
       │                                        │
       ├──── success ────► ready                │
       └──── failure ────► retry (≤2) ──► failed
```

### LLM Provider Abstraction

```
┌─────────────────────────────────────┐
│           LLMProvider               │
│  generate(options) → result        │
│  stream?(options) → chunks         │
└─────────────────┬───────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ ClaudeProvider │  ← only implementation
         └────────────────┘
                  │
                  ▼
         @anthropic-ai/sdk
```

Future providers (OpenAI, Gemini) plug in via `setLLMProvider()` without changing agent code.

---

## Database Changes

**No new migration required.** Phase 1 schema already includes:

| Column/Table | Phase 2 Usage |
|--------------|---------------|
| `projects.spec_json` | Stores Clarifier output spec |
| `projects.status` | `draft → clarifying → building → ready/failed` |
| `projects.build_count` | Incremented on successful build |
| `agent_runs` | Logs clarifier/builder runs with token counts |
| `messages` | Assistant messages for questions, spec ready, build complete |
| `files` | Builder writes generated app files |

---

## API Changes

### New Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/projects/:id/clarify` | Run Clarifier agent |
| POST | `/v1/projects/:id/build` | Run Builder agent (with retry loop) |
| POST | `/v1/projects/:id/run` | Async full pipeline (202 Accepted) |

### Modified Behavior

| Trigger | Action |
|---------|--------|
| `POST /projects` (create) | Auto-starts clarifier → builder pipeline |
| `POST /projects/:id/messages` (clarifying) | Re-runs clarifier with user answers → builder |
| `POST /projects/:id/messages` (ready/failed) | Re-runs builder for iteration |

### New SSE Events

| Event | When |
|-------|------|
| `agent.started` | Clarifier or Builder begins |
| `agent.progress` | Builder tool call (list/read/write/delete) |
| `agent.completed` | Agent finished successfully |
| `agent.failed` | Agent error |
| `build.started` | Builder run begins |
| `build.completed` | Files written, status → ready |
| `build.failed` | All retries exhausted |

### Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514
```

---

## Folder Tree (Phase 2 additions)

```
apps/api/src/
├── providers/
│   └── llm/
│       ├── index.ts              # getLLMProvider() factory
│       └── claude.provider.ts    # ClaudeProvider
├── routes/
│   └── build.routes.ts           # clarify, build, run endpoints
└── services/
    ├── agent-run.service.ts      # AgentRun CRUD + token tracking
    ├── clarifier.service.ts      # Clarifier agent
    ├── builder.service.ts        # Builder agent + tool loop
    └── build.service.ts          # Orchestration + retry loop

packages/shared/src/
├── types/
│   └── llm.ts                    # LLMProvider interface
└── schemas/
    └── spec.ts                   # AppSpec + ClarifierOutput Zod schemas
```

---

## Example: "Build a Simple CRM" Flow

### 1. User creates project

```
POST /v1/projects
{ "name": "Simple CRM", "prompt": "Build a simple CRM" }
```

→ Project created (`status: draft`)  
→ Pipeline auto-scheduled

### 2. Clarifier analyzes prompt

SSE events:
```
progress        → "Analyzing your request..."
agent.started   → { agentType: "clarifier" }
```

**Path A — Clear prompt (likely for "Build a simple CRM"):**

Clarifier returns `ready: true` immediately:

```json
{
  "ready": true,
  "questions": [],
  "spec": {
    "appType": "crm",
    "name": "Simple CRM",
    "description": "A lightweight customer relationship management app",
    "features": ["contact list", "contact details", "notes", "search", "dashboard"],
    "stack": "nextjs-prisma-tailwind",
    "entities": [
      { "name": "Contact", "fields": ["name", "email", "phone", "company", "notes"] }
    ],
    "pages": ["/", "/contacts", "/contacts/[id]"]
  }
}
```

→ `spec_json` saved to project  
→ Assistant message: "Specification ready for Simple CRM..."  
→ Builder auto-starts

**Path B — Ambiguous prompt:**

Clarifier returns 1–3 questions:

```
assistant message:
"I have a few questions before I start building:

1. Is this for a sales team or general contact management?
2. Do you need deal/pipeline tracking?

Please answer in your next message."
```

→ `status: clarifying`

### 3. User answers (if clarifying)

```
POST /v1/projects/:id/messages
{ "content": "Sales team, yes include deal pipeline" }
```

→ Clarifier runs again (forced spec generation)  
→ `spec_json` saved → Builder auto-starts

### 4. Builder generates files

SSE stream:
```
build.started     → { appType: "crm", attempt: 1 }
agent.progress    → { tool: "write_file", path: "package.json" }
file.created      → { path: "package.json", version: 1 }
progress          → { message: "Created package.json" }
agent.progress    → { tool: "write_file", path: "prisma/schema.prisma" }
file.created      → { path: "prisma/schema.prisma", version: 1 }
...
agent.progress    → { tool: "write_file", path: "src/app/page.tsx" }
...
build.completed   → { fileCount: 12 }
project.updated   → { status: "ready" }
```

Typical files generated:
```
package.json
prisma/schema.prisma
src/app/layout.tsx
src/app/page.tsx
src/app/contacts/page.tsx
src/app/contacts/[id]/page.tsx
src/components/ContactList.tsx
src/components/ContactForm.tsx
src/lib/prisma.ts
tailwind.config.ts
```

### 5. User sees result

- **File tree** populates via SSE `file.created` events
- **Activity feed** shows agent progress
- **Chat** shows "Build complete! Generated 12 files..."
- **Status badge** turns green: `ready`

### 6. Retry on failure

If Builder fails:
```
progress → "Build failed, retrying (1/2)..."
build.started → { attempt: 2 }
```

After 2 retries:
```
status: failed
assistant: "Build failed after 2 retries..."
[Retry Build] button in chat
```

---

## Builder Tools

| Tool | Maps to | Description |
|------|---------|-------------|
| `list_files` | `vfsService.listTree()` | List project file tree |
| `read_file` | `vfsService.readFile()` | Read file content |
| `write_file` | `vfsService.writeFile()` | Create/update file (+ SSE) |
| `delete_file` | `vfsService.deleteFile()` | Remove file (+ SSE) |

**Limits:** 30 tool calls per build, 10 min timeout, 2 retries on failure.

---

## Setup

```bash
# Add to .env
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Start services (same as Phase 1)
pnpm postgres:embedded   # or pnpm docker:up
pnpm db:migrate:deploy
pnpm dev
```

---

## Verification Checklist

- [ ] Create project with "Build a simple CRM"
- [ ] Clarifier produces spec or questions (check chat + SSE)
- [ ] Answer questions if asked → spec generated
- [ ] Builder writes files to VFS (check file tree)
- [ ] SSE shows agent.progress + file.created events
- [ ] Project status transitions: draft → building → ready
- [ ] `agent_runs` table has clarifier + builder entries
- [ ] `projects.spec_json` populated
- [ ] Retry works on simulated failure

---

## Phase 2 Status: **COMPLETE**

Ready for Phase 3 (E2B Preview) when approved.
