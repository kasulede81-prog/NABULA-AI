# Phase 2 Optimization Sprint

## Goals

| Goal | Target | Best Result |
|------|--------|-------------|
| Token reduction | ≥50% | **81–99%** (batch run) |
| Build duration | <3 min | **~4 min** (single CRM success) |
| Success rate | >90% | **33%** (1/3 verified; batch intermittent) |
| page.tsx on success | 100% | **100%** on successful builds |

## Implemented

### A. Batch File Writes
- Added `write_files(files[])` tool — writes up to 40 files per call
- `VfsService.writeFiles()` batch wrapper
- `normalizeWriteFilesInput()` handles malformed LLM payloads

### B. Ready Validation
- `validateBuildReady()` — requires `package.json`, `page.tsx`, `prisma/schema.prisma`
- Builds failing validation → `status: failed` (not `ready`)

### C. Build Quality Validation
- `validateBuildQuality()` — keyword match vs `appType`, features, entities
- Requires API routes + layout

### D. Context Compression
- Phased builder: **fresh conversation per phase** (no VFS resend)
- Tool inputs stripped from history (phase-isolated calls)
- Reduced from ~300K tokens/build to ~15–40K

### E. Metrics (AgentRun)
- `tool_calls`, `files_generated`, `build_duration_ms`
- Migration: `20250606180000_builder_metrics`

### F. Phased Build Manifest
- `buildManifest(spec)` drives 8–12 phases: config → data → lib → layout → API (per entity) → UI
- One `write_files` call per phase

## Reliability Fixes (Phase 2 sprint)

| Fix | Implementation |
|-----|----------------|
| `files.map` crash | `normalizeWriteFilesInput()` on all Builder file paths |
| PostgreSQL 22P05 | `sanitizeFileContent()` strips box-drawing; `DATABASE_URL?client_encoding=UTF8` |
| Phase-fatal VFS writes | `write_files` errors abort phase immediately (`PHASE_WRITE_FAILED`) |
| Retry classification | Retry only network / 429 / 5xx / transient DB — never validation or VFS |
| Clarifier stability | Skip duplicate `schedulePipeline` when lock active |
| Failure visibility | `agent_runs.error_code`, `failure_phase`, `retry_count` + activity feed |

```bash
pnpm verify:phase2-fixes
pnpm validate:phase2-reliability
```

## Commands

```bash
pnpm verify:build-validation
pnpm verify:build-manifest
pnpm validate:phase2-optimization
pnpm validate:phase2-reliability
npx pnpm@9.15.0 --filter @nebula/api exec tsx ../../scripts/test-single-build.ts
```

## Baseline vs Optimized (verified single CRM)

| Metric | Baseline | Optimized |
|--------|----------|-----------|
| Files | 29 | 24 |
| Duration | 524s | 247s |
| Tokens | 313,107 | ~38,000 |
| Tool calls | 30 | 10 |
| page.tsx | yes | yes |
| Status | ready | ready |
