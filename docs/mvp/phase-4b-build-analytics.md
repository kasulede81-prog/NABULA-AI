# Phase 4B — Build Analytics MVP

## Setup

1. Migrate database:
   ```bash
   pnpm db:migrate:dev
   pnpm db:generate
   ```

2. Set admin access in `.env`:
   ```env
   ADMIN_EMAILS=you@example.com
   ```

3. Open admin dashboard (must be logged in as listed email):
   ```
   http://localhost:3000/admin/analytics
   ```

4. Verify:
   ```bash
   pnpm verify:build-analytics
   ```

## Metrics

Aggregated from `agent_runs` where `agent_type = builder`:

- Total / successful / failed builds
- Success rate
- Average build duration, tokens, estimated cost
- Top failure codes & phases
- Builds by LLM provider (`deepseek` / `anthropic`)

Workspace editor events in `analytics_events`:

- `files_opened`, `files_saved`, `ai_edits_requested`, `ai_edits_applied`

## API

`GET /v1/admin/analytics/builds` — requires admin email (403 otherwise)
