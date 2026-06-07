# API Design

Base URL: `https://api.nebula.ai/v1`  
Auth: Bearer JWT in `Authorization` header  
Content-Type: `application/json`

## Error Format

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project with id '...' not found",
    "status": 404,
    "details": {}
  }
}
```

## Authentication

### `POST /auth/register`

Create account with email/password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "Jane Doe"
}
```

**Response `201`:**
```json
{
  "user": { "id": "uuid", "email": "user@example.com", "name": "Jane Doe" },
  "token": "jwt...",
  "expiresAt": "2026-06-07T00:00:00Z"
}
```

### `POST /auth/login`

**Request:** `{ "email", "password" }`  
**Response `200`:** Same as register.

### `POST /auth/oauth/:provider`

Providers: `google`, `github`  
**Request:** `{ "code": "oauth_authorization_code" }`  
**Response `200`:** Same as register.

### `POST /auth/logout`

Invalidate current session. **Response `204`**.

### `GET /auth/me`

**Response `200`:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "Jane Doe",
  "avatarUrl": null,
  "githubConnected": true
}
```

---

## Projects

### `POST /projects`

Create a new project from a plain-English description.

**Request:**
```json
{
  "name": "Food Delivery App",
  "prompt": "Build a food delivery app with restaurant listings, cart, and order tracking",
  "llmProvider": "anthropic",
  "llmModel": "claude-sonnet-4-20250514"
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "name": "Food Delivery App",
  "slug": "food-delivery-app",
  "status": "draft",
  "prompt": "Build a food delivery app...",
  "createdAt": "2026-06-06T12:00:00Z"
}
```

**Side effect:** Creates default `general` conversation. Optionally auto-triggers planner agent if `autoStart: true`.

### `GET /projects`

List user's projects.

**Query:** `?status=building&page=1&limit=20&sort=-createdAt`

**Response `200`:**
```json
{
  "data": [{ "id", "name", "slug", "status", "prompt", "createdAt", "updatedAt" }],
  "pagination": { "page": 1, "limit": 20, "total": 5 }
}
```

### `GET /projects/:id`

Full project detail including memory summary and GitHub status.

### `PATCH /projects/:id`

Update name, description, LLM settings, or archive.

**Request:**
```json
{
  "name": "Updated Name",
  "status": "archived"
}
```

### `DELETE /projects/:id`

Soft-delete (sets `archived_at`). **Response `204`**.

### `POST /projects/:id/start`

Trigger orchestration pipeline (planner → coding).

**Request:**
```json
{
  "mode": "full",          // "plan_only" | "code_only" | "full"
  "instructions": "Focus on mobile-first design"
}
```

**Response `202`:**
```json
{
  "agentRunId": "uuid",
  "status": "queued",
  "message": "Orchestration started"
}
```

---

## Conversations & Messages

### `GET /projects/:projectId/conversations`

List conversations for a project.

### `POST /projects/:projectId/conversations`

**Request:** `{ "title": "Planning session", "type": "planning" }`

### `GET /conversations/:id/messages`

**Query:** `?before=uuid&limit=50` (cursor pagination)

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Add a dark mode toggle",
      "contentType": "text",
      "agentRunId": null,
      "createdAt": "2026-06-06T12:00:00Z"
    }
  ],
  "hasMore": true
}
```

### `POST /conversations/:id/messages`

Send a user message. Triggers agent if `triggerAgent: true`.

**Request:**
```json
{
  "content": "Add user authentication with Google OAuth",
  "triggerAgent": true,
  "agentType": "coding"
}
```

**Response `202`:**
```json
{
  "message": { "id": "uuid", "role": "user", "content": "...", "createdAt": "..." },
  "agentRun": { "id": "uuid", "status": "queued", "agentType": "coding" }
}
```

---

## Tasks

### `GET /projects/:projectId/tasks`

Returns hierarchical task tree.

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Setup project scaffold",
      "status": "completed",
      "priority": "critical",
      "sortOrder": 0,
      "dependencies": [],
      "subtasks": [
        {
          "id": "uuid",
          "title": "Initialize Next.js",
          "status": "completed",
          "priority": "high",
          "sortOrder": 0
        }
      ]
    }
  ]
}
```

### `PATCH /tasks/:id`

Update task status (user can mark complete, cancel, etc.).

**Request:** `{ "status": "cancelled" }`

---

## Files (Virtual File System)

### `GET /projects/:projectId/files`

List file tree.

**Query:** `?path=src&depth=3`

**Response `200`:**
```json
{
  "tree": [
    {
      "path": "src",
      "isDirectory": true,
      "children": [
        { "path": "src/app/page.tsx", "isDirectory": false, "sizeBytes": 1024, "version": 3 }
      ]
    }
  ]
}
```

### `GET /projects/:projectId/files/*`

Read file content. Path after `/files/` is the file path.

**Query:** `?version=2` (optional, defaults to latest)

**Response `200`:**
```json
{
  "path": "src/app/page.tsx",
  "content": "export default function Page() { ... }",
  "version": 3,
  "mimeType": "text/typescript",
  "sizeBytes": 1024,
  "updatedAt": "2026-06-06T12:00:00Z"
}
```

### `GET /projects/:projectId/files/*/history`

Version history for a file.

### `POST /projects/:projectId/files`

Manual file write (user override).

**Request:**
```json
{
  "path": "src/app/page.tsx",
  "content": "...",
  "message": "Manual edit by user"
}
```

---

## Agent Runs

### `GET /projects/:projectId/agent-runs`

List agent execution history.

### `GET /agent-runs/:id`

Detailed run including tool calls, token usage, plan output.

**Response `200`:**
```json
{
  "id": "uuid",
  "agentType": "planner",
  "status": "completed",
  "llmProvider": "anthropic",
  "llmModel": "claude-sonnet-4-20250514",
  "inputPrompt": "...",
  "outputSummary": "Created 12 tasks across 4 phases",
  "planJson": { "phases": [], "tasks": [] },
  "toolCalls": [],
  "tokensInput": 4500,
  "tokensOutput": 2100,
  "costUsd": 0.042,
  "startedAt": "...",
  "completedAt": "..."
}
```

### `POST /agent-runs/:id/cancel`

Cancel a running or queued agent run. **Response `200`**.

### `POST /agent-runs/:id/retry`

Retry a failed agent run. **Response `202`**.

---

## GitHub

### `GET /github/connect`

Returns OAuth URL for GitHub App installation.

**Response `200`:**
```json
{
  "url": "https://github.com/apps/nebula-ai/installations/new?state=..."
}
```

### `GET /github/callback`

OAuth callback (handled by backend, redirects to frontend).

### `DELETE /github/disconnect`

Remove GitHub connection. **Response `204`**.

### `POST /projects/:projectId/github/repo`

Create GitHub repository for project.

**Request:**
```json
{
  "name": "food-delivery-app",
  "private": true,
  "description": "Generated by Nebula AI"
}
```

**Response `201`:**
```json
{
  "repoUrl": "https://github.com/user/food-delivery-app",
  "repoId": 123456,
  "defaultBranch": "main"
}
```

### `POST /projects/:projectId/github/push`

Push current VFS state to GitHub.

**Request:**
```json
{
  "message": "feat: initial application scaffold",
  "branch": "main"
}
```

**Response `202`:**
```json
{
  "commitId": "uuid",
  "status": "pending"
}
```

### `GET /projects/:projectId/github/commits`

List commit history synced to GitHub.

---

## Project Memory

### `GET /projects/:projectId/memory`

**Response `200`:**
```json
{
  "data": [
    { "key": "requirements", "value": { "features": ["auth", "cart"] }, "source": "planner" },
    { "key": "tech_decisions", "value": { "framework": "nextjs" }, "source": "planner" }
  ]
}
```

### `PUT /projects/:projectId/memory/:key`

User can override memory entries.

---

## Health

### `GET /health`

**Response `200`:** `{ "status": "ok", "version": "1.0.0" }`

### `GET /health/ready`

Checks DB, Redis, S3 connectivity.

---

## WebSocket API

**Endpoint:** `wss://api.nebula.ai/v1/ws`  
**Auth:** JWT as query param `?token=jwt` or first message.

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe` | `{ projectId }` | Subscribe to project events |
| `unsubscribe` | `{ projectId }` | Unsubscribe |
| `ping` | `{}` | Keepalive |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `agent.run.started` | `{ agentRunId, agentType, projectId }` | Agent began |
| `agent.run.progress` | `{ agentRunId, step, message }` | Progress update |
| `agent.run.completed` | `{ agentRunId, outputSummary }` | Agent finished |
| `agent.run.failed` | `{ agentRunId, error }` | Agent failed |
| `message.created` | `{ message }` | New chat message |
| `task.created` | `{ task }` | Planner created task |
| `task.updated` | `{ taskId, status }` | Task status change |
| `file.created` | `{ path, version }` | New file |
| `file.updated` | `{ path, version }` | File modified |
| `file.deleted` | `{ path }` | File removed |
| `commit.pushed` | `{ sha, url }` | GitHub push complete |
| `project.status.changed` | `{ status }` | Project lifecycle change |

### Example Flow

```
Client: subscribe { projectId: "abc" }
Server: agent.run.started { agentType: "planner" }
Server: task.created { task: { title: "Setup auth" } }
Server: task.created { task: { title: "Build API" } }
Server: agent.run.completed { outputSummary: "12 tasks planned" }
Server: agent.run.started { agentType: "coding" }
Server: file.created { path: "package.json" }
Server: file.updated { path: "src/app/page.tsx" }
Server: agent.run.completed { outputSummary: "Scaffold complete" }
Server: project.status.changed { status: "review" }
```

---

## Rate Limits

| Endpoint Group | Limit |
|----------------|-------|
| Auth | 10 req/min per IP |
| Projects CRUD | 60 req/min per user |
| Messages (agent trigger) | 20 req/min per user |
| File reads | 120 req/min per user |
| GitHub push | 5 req/min per user |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## API Versioning

- URL prefix: `/v1`
- Breaking changes → `/v2`
- Deprecation header: `Sunset: Sat, 01 Jan 2027 00:00:00 GMT`
