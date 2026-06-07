# E. Features to Delete (For Now)

## Agents — Removed Entirely

| Agent | Delete Because |
|-------|----------------|
| Planning | Users don't pay for roadmaps |
| Architecture | Fixed template eliminates need |
| UI Generation (standalone) | Merged into Builder |
| Backend Generation (standalone) | Merged into Builder |
| Database (standalone) | Merged into Builder |
| Testing | Flaky, slow, users don't see value |
| Review | User sees preview = review |
| Deployment | Preview is the product |
| GitHub | High support load, low conversion driver |
| Refactoring (standalone) | 2 retry prompts replace it |

## Platform Features — Delay Until Revenue

| Feature | Delay Until | Trigger to Build |
|---------|-------------|------------------|
| GitHub integration | $10K MRR | >30% churn survey mentions export |
| Multiple LLM providers | $5K MRR | Power users request it |
| Task / milestone board | $10K MRR | Users lost without progress view |
| File version history UI | $5K MRR | Users ask to undo |
| Google OAuth | Week 8 of MVP | Email auth works first |
| Team / org accounts | $20K MRR | B2B inbound |
| Template marketplace | $15K MRR | Repeat "start from X" requests |
| Custom domains on preview | $20K MRR | Pro+ demand |
| Production deploy (Vercel) | $15K MRR | "How do I go live?" > 20 tickets |
| Architecture artifact viewer | Never for MVP | Internal/debug only |
| API contract viewer | Never for MVP | Developer feature |
| Cost meter per agent | $5K MRR | Transparency as marketing |
| "Fast vs Best" model toggle | $10K MRR | With multi-model |
| Mobile app generation | Year 2 | Different product |
| Clarification round 2+ | Never | 1 round max |
| WebSocket | MVP uses SSE | Add if SSE insufficient |
| Admin dashboard | $5K MRR | Manual SQL until then |
| Referral program | $10K MRR | After PMF |
| Annual billing | 50 paying users | Monthly is fine initially |

## UI Panels — Cut from Workspace

| Panel | Verdict |
|-------|---------|
| Pipeline DAG view | **Delete** — show simple status badge |
| Agent timeline (detailed) | **Simplify** — "Building..." + file count |
| Milestone board | **Delete** |
| Build log viewer | **Delete** — show pass/fail only |
| GitHub status | **Delete** |
| Artifacts viewer | **Delete** |
| Diff viewer | **Delete** — iteration replaces it |
| Code editor (editable) | **Delay** — read-only Monaco is enough |
| Cost meter | **Delete** — show builds remaining only |

## Workspace MVP (3 Panels)

```
┌────────────────────────────────────────────────┐
│  Project Name    [Building...]    12 builds left │
├──────────┬─────────────────────┬───────────────┤
│ File Tree│   Preview (iframe)  │     Chat      │
│  (left)  │     (center)        │    (right)    │
└──────────┴─────────────────────┴───────────────┘
```

Click file → read-only code view in center (replaces preview temporarily). No editing.

## Database — Cut

All of `schema-v2.sql`. Phase 1 tables listed in minimum-database.md minus deleted tables.

## Infrastructure — Cut

Everything in minimum-infrastructure.md "What We Do NOT Deploy" section.

## Marketing Claims — Cut

| Don't Say (Yet) | Say Instead |
|----------------|-------------|
| "Any software" | "Web apps in minutes" |
| "10 AI agents" | "AI app builder" |
| "Enterprise-ready" | "For founders and small businesses" |
| "GitHub integration" | "Live preview in your browser" |
| "SOC 2 compliant" | Nothing — don't mention |
| "Competes with Cursor" | "No code required" |

## VC Lens: What Makes This Fundable at 90 Days

Investors at 90 days fund **traction**, not architecture:

- 20–50 paying users
- $1K+ MRR
- Demo that builds a CRM in <10 min with preview
- <$50 CAC (founder-led sales + Twitter/Reddit)
- 60%+ build success rate

They do **not** fund: 10 agents, Temporal, Firecracker, artifact registry.
