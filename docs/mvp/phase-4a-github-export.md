# Phase 4A — GitHub Export MVP

One-way export of a READY project's VFS to a new GitHub repository via Personal Access Token.

## Scope

| Included | Excluded |
|----------|----------|
| PAT connection (per user) | GitHub App |
| Create repository | Webhooks / sync |
| Upload all VFS files | Branches / PRs |
| Single initial commit | Import from GitHub |
| Store repo URL on project | Commit history UI |

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/github/connection` | Connection status |
| `PUT` | `/v1/github/connection` | Save PAT `{ "token": "ghp_..." }` |
| `DELETE` | `/v1/github/connection` | Remove stored PAT |
| `GET` | `/v1/projects/:id/github/export` | Export metadata |
| `POST` | `/v1/projects/:id/github/export` | Export project (201) |

## Setup Instructions

### 1. Database migration

```bash
pnpm db:migrate:dev
pnpm db:generate
```

### 2. Environment (optional)

PATs are encrypted at rest using AES-256-GCM. By default the key is derived from `JWT_SECRET`. Override for production:

```env
GITHUB_TOKEN_ENCRYPTION_KEY=your-32-char-minimum-secret-here
```

### 3. Create a GitHub Personal Access Token

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained** or **Classic**
2. Required scope: **`repo`** (full control of private repositories) or **public_repo** for public-only
3. Copy the token (`ghp_...` or `github_pat_...`)

### 4. Export flow

1. Build a project to **ready** status
2. Open workspace → **Connect GitHub** → paste PAT → **Save**
3. Click **Export to GitHub**
4. Nebula creates `https://github.com/{username}/{project-slug}` with one commit containing all VFS files
5. Header shows link to the repository

### 5. Verify (static, no GitHub API calls)

```bash
pnpm verify:github-export
```

## Security Notes

- PAT stored encrypted in `github_connections.token_enc`
- PAT never returned by API after save
- Export requires project ownership + `ready` status
- One export per project (re-export blocked)
