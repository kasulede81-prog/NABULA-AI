# F. 90-Day Implementation Roadmap

**Founder:** Solo, full-time  
**Goal:** 20–50 paying users, $1K+ MRR, proven build→preview loop  
**Weekly hours:** 50–60

---

## Phase 0: Days 1–7 — Skeleton

| Day | Task | Done When |
|-----|------|-----------|
| 1 | Monorepo: Next.js + Fastify + Prisma + shared types | `pnpm dev` starts both |
| 2 | Neon DB + 8-table schema + migrations | Tables exist |
| 3 | Auth: register, login, JWT, protected routes | curl login works |
| 4 | Projects CRUD API + empty workspace page | Create project |
| 5 | Messages API + chat UI (no AI yet) | Send message, see history |
| 6 | VFS: write_file, list_files, read_file services | API creates files |
| 7 | File tree component (static) | Tree renders from API |

**Do not touch:** Agents, preview, Stripe.

---

## Phase 1: Days 8–21 — Builder Agent

| Day | Task | Done When |
|-----|------|-----------|
| 8–9 | Anthropic SDK + Builder system prompt + 4 tools | Agent writes files in test script |
| 10 | Agent runner: queue job, update agent_runs, stream status | POST /build triggers agent |
| 11 | Wire build button: prompt → agent → files appear | End-to-end in dev |
| 12 | Clarifier pass (single LLM call, questions JSON) | Vague prompt → questions |
| 13 | Clarification UI in chat | User answers → build starts |
| 14–15 | Fixed starter template (Next.js + Prisma + SQLite + shadcn) | Template seeds on new project |
| 16 | SSE endpoint for build progress | UI shows "Writing src/app/page.tsx..." |
| 17 | Build retry on failure (pass stderr to agent, max 2) | Failed build auto-retries |
| 18–19 | Read-only Monaco editor (click file in tree) | View generated code |
| 20–21 | Bug bash, error messages in plain English | No raw stack traces in UI |

**Milestone:** Agent generates a todo app from prompt. No preview yet.

---

## Phase 2: Days 22–35 — Preview (The Product)

| Day | Task | Done When |
|-----|------|-----------|
| 22–23 | E2B integration: tarball VFS → sandbox → URL | Script returns preview URL |
| 24 | `previews` table + lifecycle (start, stop, expire) | Preview persists across refresh |
| 25 | Preview iframe in workspace center panel | User sees running app |
| 26 | Auto-preview after build completes | Build → preview without click |
| 27 | Preview restart on iteration build | Chat edit → new preview ~60s |
| 28 | Preview TTL: 2hr idle stop (cron or on-expire) | Sandboxes don't leak cost |
| 29–30 | Landing page + 3 example prompts + demo GIF | nebula.ai explains product |
| 31–32 | Polish: loading states, empty states, mobile layout | Doesn't look broken |
| 33–35 | Internal dogfood: build 10 app types, fix template | CRM, POS, marketplace work |

**Milestone:** *"Build a CRM"* → preview with login + contacts table in <10 min.

---

## Phase 3: Days 36–49 — Revenue

| Day | Task | Done When |
|-----|------|-----------|
| 36–37 | Stripe products: Starter $19, Pro $49 | Products in dashboard |
| 38 | Checkout flow + webhook → subscriptions table | Payment → account activated |
| 39 | Build limits enforced (counter on subscription) | 21st build blocked on Starter |
| 40 | Stripe Customer Portal link in settings | User can cancel/upgrade |
| 41 | Free tier: 1 project, 3 builds, no card | Conversion funnel |
| 42 | Usage display: "12 of 20 builds remaining" | Visible in header |
| 43–44 | Onboarding: first prompt wizard after signup | Reduces blank-page churn |
| 45 | Email via Resend: welcome, build complete, payment failed | 3 templates |
| 46–49 | Beta launch: 20 hand-picked users (Twitter, Indie Hackers) | Real feedback |

**Milestone:** First dollar. Target: 5 paying users by day 49.

---

## Phase 4: Days 50–63 — Iterate to PMF

| Day | Task | Done When |
|-----|------|-----------|
| 50–52 | Fix top 5 build failures from beta data | Success rate >60% |
| 53–54 | Iteration chat: "add dark mode" works reliably | 2nd build on same project |
| 55 | Project list page + archive/delete | Manage multiple projects |
| 56 | Google OAuth (if email signup friction reported) | Optional |
| 57–58 | 5 seed templates as prompt chips ("CRM", "POS", "Marketplace"...) | Faster time-to-value |
| 59 | Sentry error tracking | Know when things break |
| 60–63 | User interviews (10 calls), fix #1 complaint | Qualitative PMF signal |

**Milestone:** 15 paying users, <20% monthly churn on paid.

---

## Phase 5: Days 64–90 — Scale to 100 Users

| Day | Task | Done When |
|-----|------|-----------|
| 64–66 | Rate limiting + abuse prevention | No runaway sandbox costs |
| 67–68 | Landing page SEO + 2 blog posts | Organic traffic starts |
| 69–70 | Referral: "1 free month for referral" (manual coupon) | Growth loop |
| 71–73 | Improve starter template (auth, layout, nav) | Every app has login |
| 74–75 | Status page (simple) + uptime monitoring | Trust |
| 76–78 | Public launch: Product Hunt, HN Show, Reddit | Spike traffic |
| 79–82 | Support playbook (Notion doc): top 10 issues | <2hr response |
| 83–85 | Analytics: PostHog free — track build→preview→pay funnel | Data-driven |
| 86–90 | Buffer: bugs, scaling pains, first $2K MRR push | 30–50 paying users |

**Milestone:** $1.5K–2.5K MRR, path to 100 users by month 5.

---

## Weekly Cadence (Founder)

| Day | Focus |
|-----|-------|
| Mon–Thu | Build |
| Fri AM | Bug fixes + user support |
| Fri PM | 1 user call |
| Sat | Optional: content marketing |
| Sun | Off (burnout prevention) |

## What NOT to Do During 90 Days

- Split agents
- Add GitHub
- Add second LLM provider
- Build custom sandbox
- Build workflow engine
- Build task board
- Build mobile responsive admin
- Rewrite in Rust
- Raise prices before 20 users
- Hire anyone

## Post-90-Day Roadmap (Revenue-Gated)

| MRR | Next Feature |
|-----|-------------|
| $2K | GitHub export |
| $5K | OpenAI as UI option |
| $5K | File edit in browser |
| $10K | Split UI + Backend agents |
| $10K | Hire contractor for support |
| $15K | Production deploy to Vercel |
| $20K | Team accounts |

## Evolution to Full v2 Architecture

```
MVP (Day 90)                    Full Platform (Month 12–18)
─────────────                   ───────────────────────────
1 Builder agent          →      UI + Backend + Database agents
spec_json column         →      Artifact registry
status if/else           →      Workflow DAG (Temporal)
E2B sandbox              →      Self-hosted preview pool
SSE                      →      WebSocket + event archive
8 tables                 →      schema-v2 tables (migrate)
Clarifier + Builder      →      + Requirements + Review
No GitHub                →      GitHub agent
Claude only              →      Model router
```

Each upgrade is **revenue-gated**, not calendar-gated. The MVP schema and `agent_runs` table are designed to absorb upgrades without rewrite.

---

## 90-Day Budget (Cash)

| Item | Cost |
|------|------|
| Infra (3 mo) | $180 |
| E2B sandbox (3 mo) | $600 |
| LLM API (dev + users) | $1,500 |
| Domain, Stripe fees | $100 |
| **Total** | **~$2,400** |

Leaves **~9.5 months runway** after infra for founder living expenses. Revenue at $2K MRR by day 90 extends runway significantly.
