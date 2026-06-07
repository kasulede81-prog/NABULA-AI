# Phase 4C — Monaco Editor + AI File Editing MVP

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start stack:
   ```bash
   pnpm dev
   ```

3. Verify:
   ```bash
   pnpm verify:monaco-editor
   ```

## Usage

1. Open a READY (or any) project workspace.
2. Click a file in the tree → Monaco editor opens with tabs.
3. Edit and **Save** (or Ctrl/Cmd+S).
4. **+** / **R** / **×** in file tree for create / rename / delete.
5. **AI Edit** → enter instruction → review diff → **Apply**.

When no file is selected, center panel shows **Live Preview**.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `PATCH` | `/v1/projects/:id/files/rename` | `{ fromPath, toPath }` |
| `POST` | `/v1/projects/:id/files/ai-edit` | Propose edit `{ path, instruction }` |
| `POST` | `/v1/projects/:id/files/ai-edit/apply` | Save AI result `{ path, content }` |

Existing file GET/POST/DELETE unchanged; SSE `file.*` events preserved.

## Safety

- `vfsPathSchema` on all paths
- 1 MB max file size (shared schema + AI edit)
- Single-file AI edits only; no tools or shell
