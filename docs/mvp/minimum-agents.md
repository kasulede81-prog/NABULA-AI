# B. Minimum Viable Agent System

## Agent Audit (v2 → MVP)

| v2 Agent | MVP Decision | Rationale |
|----------|--------------|-----------|
| **Requirements** | **KEEP (simplified)** | Clarification = conversion + quality; 1 LLM call, not a pipeline |
| **Planning** | **MERGE → Requirements** | Roadmap is overhead; users want the app, not a Gantt chart |
| **Architecture** | **MERGE → Builder** | Stack selection in Builder system prompt + template |
| **UI Generation** | **MERGE → Builder** | One agent writes all files |
| **Backend Generation** | **MERGE → Builder** | Same |
| **Database** | **MERGE → Builder** | Same; use Prisma template |
| **Testing** | **DELETE** | Solo founder can't debug flaky tests; users don't pay for tests |
| **Refactoring** | **MERGE → Builder retry** | On build fail: re-prompt Builder with error log (max 2 retries) |
| **Review** | **DELETE** | User IS the reviewer (they see preview) |
| **Deployment** | **DELETE** | Preview IS deployment for MVP |
| **GitHub** | **DELETE** | #1 support burden, not needed to pay; add at 200+ users |

**Result: 2 agents → 1.5 agents** (Clarifier + Builder; retry loop is not a separate agent)

---

## MVP Agent System

### Agent 1: Clarifier (optional pass)

**When:** New project OR prompt is vague (heuristic: <50 words or no nouns detected).  
**Model:** Claude Sonnet (one provider only for MVP).  
**Output:** JSON with `questions[]` OR `ready: true` + `spec`.

```json
{
  "ready": false,
  "questions": [
    { "id": "1", "text": "Is this for staff only or customer-facing too?" }
  ],
  "spec": null
}
```

```json
{
  "ready": true,
  "questions": [],
  "spec": {
    "appType": "pos",
    "features": ["menu", "orders", "payments"],
    "stack": "nextjs-prisma-tailwind"
  }
}
```

**Max 1 clarification round.** After that, proceed with assumptions. Non-technical users won't tolerate a 5-round interview.

**Tools:** None. Pure JSON output.

**Cost:** ~$0.05 per call.

---

### Agent 2: Builder (does everything else)

**When:** Spec is ready, or user sends iteration message.  
**Model:** Claude Sonnet.  
**Template:** Start from **one** locked starter: `Next.js 15 + Prisma + SQLite + Tailwind + shadcn`.

**Why one template:** Eliminates Architecture agent. "Airbnb clone" and "restaurant POS" differ in *content*, not *stack*. Stack choice paralysis kills solo founders.

**Tools (4 only):**

| Tool | Purpose |
|------|---------|
| `write_file` | Create/update files |
| `read_file` | Read before edit |
| `list_files` | See project tree |
| `delete_file` | Remove files |

**No** `run_command`, `create_task`, `write_artifact`, `create_pr`.

**Loop:** Max 30 tool calls per build. Timeout 10 min.

**On build failure (sandbox):**
1. Capture stderr (last 50 lines)
2. Re-invoke Builder: *"Fix these errors: {log}"*
3. Max 2 auto-retries
4. If still failing → status `failed`, show friendly message + "Try again" button

This replaces Testing, Refactoring, and Review agents.

---

## Prompt Structure (Builder)

```
SYSTEM:
You build complete Next.js apps from specifications.
Stack is FIXED: Next.js 15 App Router, Prisma, SQLite, Tailwind, shadcn/ui.
Write complete runnable code. No TODOs. No placeholders.
Use write_file for each file.

SPEC: {spec JSON}
EXISTING FILES: {tree listing only, read_file for details}
USER MESSAGE: {iteration request}
```

---

## What We Tell Customers (CPO)

| Marketing | Reality |
|-----------|---------|
| "AI Software Engineer" | AI app builder (honest) |
| "Complete applications" | Complete Next.js web apps |
| "Any software" | Web apps from templates (expand later) |
| "Multiple AI models" | "Powered by Claude" (add models when churn demands) |

Under-promise, over-deliver on preview. Lovable won with preview, not architecture docs.

---

## Evolution Path (Don't Build Now, Design For)

```typescript
// Future: split Builder without rewriting orchestrator
type AgentType = 'clarifier' | 'builder' | 'ui' | 'backend'; // extend enum

// Future: extract when Builder prompt > 8K tokens
if (project.complexity === 'high') dispatch(['ui', 'backend']);
```

Keep `agent_runs.agent_type` column. Log clarifier and builder runs separately. When revenue hits $10K MRR, split Builder.

---

## Model Strategy (MVP)

| Decision | Choice |
|----------|--------|
| Providers | **Claude only** (Anthropic) |
| Fallback | None (show error, retry later) |
| User model picker | **Delete** |
| Cost tracking | `agent_runs.tokens_*` columns only |

Adding OpenAI/Gemini/DeepSeek is a **month 4–6** feature when users ask for it, not day 1.

**Unit economics:** ~$1.50 LLM + ~$0.30 sandbox per build. At $49/mo with 20 builds = profitable.
