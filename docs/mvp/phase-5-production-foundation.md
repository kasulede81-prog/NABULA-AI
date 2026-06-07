# Phase 5 — Production Foundation

Supabase database configuration, build limit enforcement, and preview lifecycle stabilization for private beta.

---

# Production Foundation Report

## Supabase Configuration

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled connection via Supabase Supavisor (port **6543**, `?pgbouncer=true`) — used by the API at runtime |
| `DIRECT_URL` | Direct PostgreSQL connection (port **5432**) — used by Prisma Migrate only |
| `JWT_SECRET` | Auth signing (min 32 chars) |
| `E2B_API_KEY` | Preview sandboxes |
| `E2B_PREVIEW_TEMPLATE` | Prebuilt template (`nebula-nextjs-prisma`) |
| `PREVIEW_TTL_MS` | Max preview lifetime (default 2 h) |
| `PREVIEW_RECONCILE_INTERVAL_MS` | Expiration/orphan/health sweep interval (default 60 s) |
| `PREVIEW_MAX_PER_USER` | Active preview cap per user (default 2) |
| `PREVIEW_COST_USD_PER_HOUR` | Estimated E2B cost rate for analytics (default $0.10) |

**Local development:** set `DIRECT_URL` to the same value as `DATABASE_URL`.

**Supabase example:**

```env
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

### Prisma Compatibility

- `packages/database/prisma/schema.prisma` uses `url` + `directUrl` datasource block.
- All existing migrations remain valid PostgreSQL DDL.
- Run migrations against `DIRECT_URL`; the API connects through the pooler.

### Migration Steps

1. Create a Supabase project (PostgreSQL 15+).
2. Copy pooled and direct connection strings from **Project Settings → Database**.
3. Set `DATABASE_URL` and `DIRECT_URL` in production secrets.
4. From repo root:

```bash
pnpm db:generate
pnpm db:migrate:deploy
```

5. Verify tables exist:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected tables: `users`, `projects`, `messages`, `files`, `agent_runs`, `previews`, `github_connections`, `analytics_events`, `subscriptions`, `user_sessions`, `_prisma_migrations`.

6. Start API and confirm `/v1/health/ready` returns `database: ready`.

### Backup Strategy

| Method | Frequency | Retention |
|--------|-----------|-----------|
| Supabase automated backups (Pro plan) | Daily | 7–30 days per plan |
| `pg_dump` via `DIRECT_URL` | Weekly manual | 90 days off-site |
| Pre-migration snapshot | Before each `migrate:deploy` | Until rollback window closes |

```bash
pg_dump "$DIRECT_URL" -Fc -f nebula-backup-$(date +%Y%m%d).dump
```

### Rollback Plan

1. **Application rollback:** redeploy previous API image; old code is compatible with current schema if no destructive migration was applied.
2. **Migration rollback:** Prisma has no automatic down migrations — restore from `pg_dump` if a migration fails mid-deploy.
3. **Supabase failover:** create new project, restore dump, update `DATABASE_URL` / `DIRECT_URL`, redeploy API.
4. **Local fallback:** `pnpm docker:up` + local `DATABASE_URL` for emergency dev continuity.

---

## Build Limits Enforcement

### Behavior

| Event | Action |
|-------|--------|
| Clarifier or Builder about to start | `assertBuildAllowed` / `consumeBuildSlot` checks subscription |
| Free/starter at limit | `BUILD_LIMIT_REACHED` (429), assistant message, SSE `build.limit_reached` |
| Builder starts successfully | `buildsUsedThisPeriod` incremented atomically in a transaction |
| Pro plan | Unlimited builds (`plan === "pro"` bypasses limit) |
| Period rollover | When `currentPeriodEnd` is past, counter resets to 0 |

### Files

- `apps/api/src/services/subscription.service.ts` — limit logic
- `apps/api/src/services/build.service.ts` — enforcement (Clarifier/Builder services unchanged)

### Analytics

Blocked attempts recorded as `build_limit_reached` in `analytics_events`.

---

## Preview Stabilization

### Behavior

| Feature | Implementation |
|---------|----------------|
| TTL enforcement | `preview-lifecycle.service` sweeps `expiresAt < now` every 60 s |
| Auto-stop expired sandboxes | `forceStop` kills E2B sandbox, sets `stopped`, records cost |
| Orphan reconciliation | On API startup: all `starting` previews cleaned; interval: stale `starting` not in-memory |
| Health monitoring | HEAD probe on ready preview URLs; unhealthy → force stop |
| Cost tracking | `estimatedCostUsd` on preview row + `analytics_events` (`preview_stopped`, `preview_expired`) |
| Per-user concurrency | Max `PREVIEW_MAX_PER_USER` active (`starting` + `ready`) previews |
| E2B pre-check | `E2B_NOT_CONFIGURED` returned synchronously before HTTP 202 |

### Files

- `apps/api/src/services/preview.service.ts` — concurrency, cost, `forceStop`
- `apps/api/src/services/preview-lifecycle.service.ts` — background reconciliation
- `apps/api/src/index.ts` — starts lifecycle on boot, stops on SIGTERM

### Schema

Migration `20250609120000_preview_lifecycle` adds `started_at`, `estimated_cost_usd`, and index on `(status, expires_at)`.

---

## Cost Controls

| Control | Status |
|---------|--------|
| Build limit per subscription | Enforced |
| Pro unlimited tier | Enforced |
| Preview TTL auto-stop | Enforced |
| Preview per-user concurrency cap | Enforced |
| Preview cost recorded on stop/expire | Enforced |
| Blocked build analytics | Enforced |
| API rate limiting | Not in scope (Phase 6) |
| Distributed job queue | Not in scope (Phase 6) |

---

## Verification Results

Run:

```bash
pnpm verify:production-foundation
```

Static + unit checks cover:

- Supabase `DIRECT_URL` / pooled config
- Preview lifecycle migration and fields
- Build limit enforcement wiring
- SSE `build.limit_reached` and `preview.expired`
- Free user blocked at limit; pro user continues
- Analytics event types for blocked builds and preview costs
- Lifecycle service started on API boot

---

## Remaining Launch Blockers

| Priority | Blocker |
|----------|---------|
| Critical | Build E2B template (`pnpm build:e2b-preview-template`) before beta previews |
| Critical | Apply all migrations on Supabase production (`db:migrate:deploy`) |
| High | No API rate limiting — abuse risk remains |
| High | In-memory SSE / build locks — single-instance only |
| High | JWT in `localStorage` — XSS session theft risk |
| Medium | No automated Supabase backup on Free tier — upgrade or manual `pg_dump` |
| Medium | Preview URLs remain unauthenticated E2B hostnames |
| Medium | File content in Postgres TEXT — storage scaling limit |
| Low | Stripe billing integration not wired (manual pro upgrades via DB) |

**Private beta readiness:** Achievable for ≤100 users on a **single API instance** after Supabase migration, E2B template build, and env validation.
