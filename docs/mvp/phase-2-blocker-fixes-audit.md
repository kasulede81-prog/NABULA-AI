# Phase 2 Blocker Fixes — Re-Audit

**Date:** 2026-06-06  
**Scope:** Audit blockers only (no Phase 3, no new features)

---

## Fixes Implemented

| # | Blocker | Fix |
|---|---------|-----|
| 1 | Builder tool path security | `validateVfsPath()` + `vfsPathSchema` in `@nebula/shared`; used by REST + Builder tools |
| 2 | Retry classification | `AgentError` + `isRetryableError()`; non-retryable codes skip retry loop |
| 3 | Clarifier concurrency | `ProjectLock` — one active clarifier per project |
| 4 | Startup validation | `logAgentReadinessWarning()` on boot; `/health` + `/health/ready` expose agent state |
| 5 | Verification scripts | `verify:path-security`, `verify:retry`, `verify:clarifier-lock`, `verify:phase2-fixes` |

---

## Automated Verification

```
pnpm verify:phase2-fixes
  verify:path-security  → 11/11 PASS
  verify:retry          → 10/10 PASS
  verify:clarifier-lock → 4/4 PASS
pnpm lint               → PASS
```

---

## Live API Verification

| Check | Result |
|-------|--------|
| `GET /health` exposes `agents.ready` | PASS — `anthropicConfigured: false` |
| `GET /health/ready` returns 503 when key missing | PASS |
| `POST /build` without spec → `NO_SPEC` immediately | PASS — status stays `draft` (not `failed`) |
| REST path `../evil.ts` blocked | PASS — `VALIDATION_ERROR` |

---

## Scores

### Security Score: **82 / 100** (was ~30 for agent tools)

| Area | Score |
|------|-------|
| Shared path validation (REST + Builder) | 95 |
| Cross-project isolation | 90 |
| Auth on agent routes | 90 |
| Startup config exposure | 85 |
| Live penetration testing | 40 (no Claude build executed) |

### Reliability Score: **62 / 100** (was 34)

| Area | Score |
|------|-------|
| Retry classification | 90 |
| Clarifier locking | 85 |
| Graceful config degradation | 80 |
| Live E2E builds | 0 (no API key) |
| Agent run accounting on retry | 50 (unchanged) |

---

## Remaining Blockers (before Phase 3)

| # | Blocker | Action |
|---|---------|--------|
| 1 | **`ANTHROPIC_API_KEY` not configured** | Add to `.env`, restart API |
| 2 | **Live E2E unverified** | Run 3 prompts (CRM, task manager, POS) with real key |
| 3 | **`verify:phase1` health/ready** | Returns 503 without API key (intentional); update expectations or set key |
| 4 | **Builder empty-tool success** | Pre-existing VFS files can satisfy success check (low priority) |
| 5 | **Multiple `agent_runs` per retry** | Token accounting fragmented across retries (low priority) |

---

## Phase 3 Go / No-Go

### **NO-GO** (unchanged)

Blockers #1 and #2 must be cleared. All code-level audit blockers are resolved.
