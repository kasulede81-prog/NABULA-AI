# Nebula AI

**Vision:** Users describe software in plain English and the platform creates complete applications automatically.

**Current focus:** Platform architecture (v2) — evolving from orchestration engine to complete AI Software Engineer.

**Phase 1 (complete on paper):** Orchestration engine design.  
**Phase 2+ (active design):** 10 specialist agents, live preview, verified builds.

## Examples

- Build a food delivery app
- Build a CRM system
- Build a SaaS starter
- Build an e-commerce website

No programming knowledge required.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | Node.js, Fastify, PostgreSQL, Prisma |
| AI | OpenAI, Claude (Anthropic), Gemini (Google), DeepSeek |
| Storage | PostgreSQL + S3-compatible object storage |
| Git | GitHub App integration |

## Architecture Documents

### Platform v2 (Current — Complete System Design)

| # | Deliverable | Location |
|---|-------------|----------|
| — | **Platform Overview** | [`docs/platform/README.md`](docs/platform/README.md) |
| 1 | Complete System Architecture | [`docs/platform/system-architecture.md`](docs/platform/system-architecture.md) |
| 2 | Agent Communication | [`docs/platform/agent-communication.md`](docs/platform/agent-communication.md) |
| 3 | Event Architecture | [`docs/platform/event-architecture.md`](docs/platform/event-architecture.md) |
| 4 | Database Updates | [`docs/platform/database-v2.md`](docs/platform/database-v2.md) |
| 5 | Queue & Workers | [`docs/platform/queue-workers.md`](docs/platform/queue-workers.md) |
| 6 | Scaling Strategy | [`docs/platform/scaling-strategy.md`](docs/platform/scaling-strategy.md) |
| 7 | Cost Control | [`docs/platform/cost-control.md`](docs/platform/cost-control.md) |
| 8 | Security Strategy | [`docs/platform/security-strategy.md`](docs/platform/security-strategy.md) |
| 9 | Folder Structure | [`docs/platform/folder-structure-v2.md`](docs/platform/folder-structure-v2.md) |
| 10 | Production Roadmap | [`docs/platform/production-roadmap.md`](docs/platform/production-roadmap.md) |

### MVP Cut (Active — Solo Founder, 90 Days) ⭐

| Deliverable | Location |
|-------------|----------|
| **MVP overview** | [`docs/mvp/README.md`](docs/mvp/README.md) |
| **Phase 1 complete** | [`docs/mvp/phase-1-complete.md`](docs/mvp/phase-1-complete.md) |
| 90-day roadmap | [`docs/mvp/90-day-roadmap.md`](docs/mvp/90-day-roadmap.md) |
| MVP database | [`packages/database/schema-mvp.sql`](packages/database/schema-mvp.sql) |

### Phase 1 (Historical — Orchestration Engine)

| Deliverable | Location |
|-------------|----------|
| Phase 1 docs | [`docs/architecture/`](docs/architecture/) |

## Quick Start (Post-Implementation)

```bash
# Infrastructure
docker compose up -d

# Backend
cd apps/api && pnpm install && pnpm db:migrate:deploy && pnpm dev

# Frontend
cd apps/web && pnpm install && pnpm dev
```

## License

Proprietary — All rights reserved.
