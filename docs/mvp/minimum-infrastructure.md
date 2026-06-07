# D. Minimum Viable Infrastructure

## Principle

**Buy everything boring. Build only the agent loop and workspace UI.**

Monthly infra budget target: **<$200** at 0 users, **<$800** at 100 paying users.

## Stack

| Layer | MVP Choice | Monthly Cost (100 users) |
|-------|-----------|--------------------------|
| Frontend hosting | Vercel Pro | $20 |
| API hosting | Railway or Fly.io (1 instance) | $20–40 |
| Database | Neon Postgres free → $19 | $19 |
| Redis | Upstash free tier | $0–10 |
| Sandbox | **E2B** or **Modal** (pay per sandbox-minute) | $200–500 |
| LLM | Anthropic API | $300–600 (pass-through to revenue) |
| Auth | Roll your own JWT (bcrypt) | $0 |
| Billing | Stripe | 2.9% of revenue |
| Email | Resend free tier | $0 |
| Domain + DNS | Cloudflare | $15/yr |

**Total fixed:** ~$60/mo + variable LLM/sandbox.

## What We Do NOT Deploy

| Component | Why Premature |
|-----------|---------------|
| Kubernetes | 1 founder, 100 users — Railway is fine until 1K users |
| Firecracker / custom sandbox | 4–8 weeks alone; E2B gives preview day 1 |
| Temporal | Workflow = `if/else` on status |
| Kafka | Redis or in-process events |
| Separate worker service | Same Node process |
| S3 / MinIO | Files in Postgres (<1MB projects) |
| Docker Compose locally | Nice for dev; founder uses Neon + E2B directly |
| preview-proxy service | E2B returns public HTTPS URL |
| WAF / SOC2 | At 100 users, Stripe + HTTPS is enough |
| Multi-region | US-only |
| CI/CD beyond GitHub Actions lint | Deploy on push to main |
| Monitoring beyond Sentry free + UptimeRobot | Enough |

## Sandbox Strategy (Critical Decision)

**Do not build sandbox infrastructure.** Use a managed API:

| Provider | Pros | Cons |
|----------|------|------|
| **E2B** | Built for AI code execution, public URL | Cost at scale |
| **Modal** | Cheap, fast cold start | More setup |
| **Daytona** | Dev environments focus | Newer |

**MVP flow:**
```
1. VFS snapshot → tarball
2. POST to E2B with startup script: npm install && npm run dev
3. Receive preview URL
4. Store in previews table
5. On file change: restart sandbox (no hot-reload for MVP — acceptable)
```

Restart preview on iteration (~30s) is fine for 100 users. Hot-reload is month 4.

## API Deployment (Single Process)

```
┌─────────────────────────────────────┐
│  Railway / Fly (1 container)        │
│                                     │
│  Fastify API                        │
│  ├── REST routes                    │
│  ├── SSE /events                    │
│  ├── BullMQ worker (same process)   │
│  └── Agent runner                   │
└─────────────────────────────────────┘
         │              │
    Neon Postgres   Upstash Redis
```

Scale trigger for second instance: **never in first 90 days.**

## Redis Usage (Minimal)

| Use | Required? |
|-----|-----------|
| BullMQ job queue | Yes (1 queue) |
| Rate limiting | Yes |
| SSE pub/sub | Optional (can poll DB) |
| File locks | No (single agent) |
| Blackboard | No |

## Environment Variables (8)

```
DATABASE_URL
REDIS_URL
ANTHROPIC_API_KEY
E2B_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
JWT_SECRET
WEB_URL
```

## Disaster Recovery (Honest)

At 100 users: daily Neon backups, git repo is the codebase DR plan. RTO: 4 hours. RPO: 24 hours. Good enough.

## Upgrade Triggers

| Signal | Action |
|--------|--------|
| Sandbox bill > $2K/mo | Evaluate self-hosted preview |
| API p95 > 2s | Add second Railway instance |
| Files > 50MB/project | Move to S3 |
| 500+ concurrent builds | Separate worker process |
| Churn cites "no GitHub" | Ship GitHub export |
