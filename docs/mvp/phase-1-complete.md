# Phase 1 — Implementation Complete

Solo-founder MVP skeleton. **No agents, no preview, no Stripe** (Phase 2+).

## What Was Built

| Feature | Status |
|---------|--------|
| Monorepo (pnpm + Turbo) | ✅ |
| Database schema (8 tables, Prisma) | ✅ |
| Authentication (register, login, JWT, sessions) | ✅ |
| Project creation & listing | ✅ |
| Chat interface (messages per project) | ✅ |
| Virtual file system (CRUD + versioning) | ✅ |
| SSE progress streaming | ✅ |

---

## Folder Tree

```
nebula-ai/
├── apps/
│   ├── api/                          # Fastify REST API
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── app.ts
│   │   │   ├── config/env.ts
│   │   │   ├── lib/
│   │   │   │   ├── prisma.ts
│   │   │   │   ├── password.ts
│   │   │   │   ├── jwt.ts
│   │   │   │   └── slug.ts
│   │   │   ├── middleware/auth.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── projects.routes.ts
│   │   │   │   ├── messages.routes.ts
│   │   │   │   ├── files.routes.ts
│   │   │   │   ├── events.routes.ts      # SSE
│   │   │   │   └── health.routes.ts
│   │   │   └── services/
│   │   │       ├── auth.service.ts
│   │   │       ├── project.service.ts
│   │   │       ├── message.service.ts
│   │   │       ├── vfs.service.ts
│   │   │       └── event.service.ts
│   │   └── package.json
│   │
│   └── web/                          # Next.js 15 frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx              # Landing
│       │   │   ├── login/page.tsx
│       │   │   ├── register/page.tsx
│       │   │   └── projects/
│       │   │       ├── page.tsx          # Project list
│       │   │       ├── new/page.tsx      # Create project
│       │   │       └── [id]/page.tsx     # Workspace
│       │   ├── components/
│       │   │   ├── chat/ChatPanel.tsx
│       │   │   ├── workspace/
│       │   │   │   ├── FileTree.tsx
│       │   │   │   ├── FileViewer.tsx
│       │   │   │   └── ProgressFeed.tsx
│       │   │   ├── layout/Header.tsx
│       │   │   └── ui/{Button,Input}.tsx
│       │   ├── hooks/
│       │   │   ├── useAuth.ts
│       │   │   └── useSSE.ts
│       │   └── lib/api.ts
│       └── package.json
│
├── packages/
│   ├── database/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/index.ts
│   └── shared/
│       └── src/
│           ├── schemas/              # Zod validation
│           └── constants/events.ts     # SSE event types
│
├── infrastructure/
│   └── docker-compose.yml            # PostgreSQL only
├── docs/mvp/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Database Diagram

```mermaid
erDiagram
    users ||--o{ user_sessions : has
    users ||--o| subscriptions : has
    users ||--o{ projects : owns
    users ||--o{ agent_runs : runs

    projects ||--o{ messages : contains
    projects ||--o{ files : stores
    projects ||--o{ agent_runs : tracks
    projects ||--o| previews : previews

    users {
        uuid id PK
        citext email UK
        text password_hash
        text name
        text stripe_customer_id
    }

    subscriptions {
        uuid id PK
        uuid user_id FK UK
        enum plan
        int builds_used_this_period
        int builds_limit
    }

    projects {
        uuid id PK
        uuid user_id FK
        text name
        text slug
        text prompt
        enum status
        jsonb spec_json
        text preview_url
    }

    messages {
        uuid id PK
        uuid project_id FK
        enum role
        text content
    }

    files {
        uuid id PK
        uuid project_id FK
        text path UK
        text content
        int version
    }

    agent_runs {
        uuid id PK
        uuid project_id FK
        enum agent_type
        enum status
    }

    previews {
        uuid id PK
        uuid project_id FK UK
        text url
        enum status
    }
```

**8 tables:** `users`, `user_sessions`, `subscriptions`, `projects`, `messages`, `files`, `agent_runs`, `previews`

---

## API Routes

Base URL: `http://localhost:3001/v1`  
Auth: `Authorization: Bearer <jwt>`

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Liveness check |
| GET | `/health/ready` | No | DB connectivity |

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create account |
| POST | `/auth/login` | No | Login |
| POST | `/auth/logout` | Yes | Invalidate session |
| GET | `/auth/me` | Yes | Current user + subscription |

### Projects

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/projects` | Yes | List user's projects |
| POST | `/projects` | Yes | Create project |
| GET | `/projects/:id` | Yes | Get project |
| PATCH | `/projects/:id` | Yes | Update project |
| DELETE | `/projects/:id` | Yes | Delete project |

### Messages (Chat)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/projects/:projectId/messages` | Yes | List messages |
| POST | `/projects/:projectId/messages` | Yes | Send user message |

### Files (VFS)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/projects/:projectId/files` | Yes | List all files |
| GET | `/projects/:projectId/files/*` | Yes | Read file by path |
| POST | `/projects/:projectId/files` | Yes | Write/create file |
| DELETE | `/projects/:projectId/files/*` | Yes | Delete file |

### SSE Events

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/projects/:projectId/events` | Yes | Server-Sent Events stream |

**SSE event types:** `connected`, `message.created`, `file.created`, `file.updated`, `file.deleted`, `progress`, `project.updated`

---

## Environment Variables

| Variable | Required | Example | Used By |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | `postgresql://nebula:nebula_dev@localhost:5432/nebula_ai` | API, Prisma |
| `JWT_SECRET` | Yes | 32+ char random string | API |
| `API_PORT` | No | `3001` | API |
| `API_HOST` | No | `0.0.0.0` | API |
| `WEB_URL` | No | `http://localhost:3000` | API (CORS) |
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:3001/v1` | Web |

Copy `.env.example` to `.env` (root) and `apps/web/.env.local` for the frontend.

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` or `npx pnpm`)
- PostgreSQL 16 (Docker or local)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL

```bash
pnpm docker:up
# Or use Neon/cloud Postgres and set DATABASE_URL
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit JWT_SECRET to a random 32+ character string

cp apps/web/.env.example apps/web/.env.local
```

### 4. Run database migrations

```bash
# Clean clone / production-like setup
pnpm db:migrate:deploy

# Local development (creates migrations interactively)
pnpm db:migrate:dev
```

### 5. Start development servers

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/v1/health

### 6. Verify Phase 1

```bash
# SSE hijack lifecycle (no database)
pnpm verify:sse

# Full smoke test (API must be running: pnpm dev)
pnpm verify:phase1
```

Manual checks:

1. Register at `/register`
2. Create a project at `/projects/new`
3. Open workspace — send a chat message
4. Write a file via API (`POST /v1/projects/:id/files`) — file appears in tree, SSE activity feed updates
5. Click file in tree — view content in center panel

---

## Next Phase (Awaiting Approval)

Phase 2 per 90-day roadmap:

- Clarifier agent (Claude)
- Builder agent (Claude + 4 tools)
- Build job queue
- E2B preview integration

**Do not proceed until Phase 1 is approved.**
