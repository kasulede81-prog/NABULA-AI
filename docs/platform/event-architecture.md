# Event Architecture

## Design Goals

1. **Real-time UX** — Live workspace updates with <500ms latency
2. **Audit trail** — Every state change reconstructable for debugging and billing
3. **Decoupling** — Agents, workflow engine, sandbox, and UI are event-driven
4. **Replay** — New WebSocket clients can catch up on project state
5. **Scale** — 10K concurrent projects without event loss

## Event Layers

```mermaid
flowchart TB
    subgraph Producers
        AG[Agents]
        WF[Workflow Engine]
        SBX[Sandbox]
        GH[GitHub Service]
        VFS[VFS Service]
    end

    subgraph Bus["Event Bus (Redis Streams)"]
        PS[project:{id} stream]
        GS[global:metrics stream]
    end

    subgraph Consumers
        WSS[WebSocket Fanout]
        AUD[Audit Writer]
        MET[Metrics Collector]
        BILL[Billing Meter]
        TGR[Workflow Trigger]
    end

    Producers --> Bus
    PS --> WSS & AUD & BILL & TGR
    GS --> MET
```

## Event Envelope

All events share a standard envelope:

```typescript
interface EventEnvelope {
  id: string;                          // UUID v7 (time-ordered)
  type: EventType;
  projectId: string;
  workflowRunId?: string;
  agentRunId?: string;
  userId: string;
  timestamp: string;                   // ISO 8601
  version: 1;                          // schema version
  payload: Record<string, unknown>;
  metadata: {
    correlationId: string;             // trace across services
    causationId?: string;              // parent event id
    source: EventSource;
  };
}

type EventSource =
  | "agent"
  | "workflow"
  | "sandbox"
  | "github"
  | "vfs"
  | "system";
```

## Event Catalog

### Workflow Events

| Type | Payload | UI Impact |
|------|---------|-----------|
| `workflow.started` | `{ workflowId, projectId }` | Show pipeline view |
| `workflow.node.started` | `{ nodeId, agentType }` | Highlight active step |
| `workflow.node.completed` | `{ nodeId, duration }` | Mark step complete |
| `workflow.node.failed` | `{ nodeId, error }` | Show error card |
| `workflow.paused` | `{ reason, gateType }` | Show gate UI |
| `workflow.resumed` | `{ resumedBy }` | Resume pipeline |
| `workflow.completed` | `{ totalDuration, totalCost }` | Celebration state |
| `workflow.failed` | `{ failedNode, error }` | Error recovery UI |

### Agent Events

| Type | Payload | UI Impact |
|------|---------|-----------|
| `agent.run.queued` | `{ agentType, model }` | Queue position badge |
| `agent.run.started` | `{ agentType, model, milestone }` | Agent activity panel |
| `agent.run.progress` | `{ step, message, percent? }` | Progress text |
| `agent.run.tool_executed` | `{ tool, path?, summary }` | Activity log entry |
| `agent.run.token_usage` | `{ input, output, costUsd }` | Cost ticker |
| `agent.run.completed` | `{ summary, artifactsWritten }` | Agent done badge |
| `agent.run.failed` | `{ error, retryable }` | Error with retry button |
| `agent.run.cancelled` | `{ reason }` | Cancelled badge |

### Clarification Events

| Type | Payload | UI Impact |
|------|---------|-----------|
| `clarification.requested` | `{ questions[], round }` | Chat shows questions |
| `clarification.answered` | `{ answers[] }` | User answers shown |
| `clarification.expired` | `{ assumptions[] }` | "We assumed..." notice |

### Artifact Events

| Type | Payload | UI Impact |
|------|---------|-----------|
| `artifact.created` | `{ type, version }` | Artifacts panel update |
| `artifact.updated` | `{ type, version, diff? }` | Version badge |

### File Events

| Type | Payload | UI Impact |
|------|---------|-----------|
| `file.created` | `{ path, agentType, version }` | Tree node appears |
| `file.updated` | `{ path, agentType, version, linesChanged }` | Tree highlight |
| `file.deleted` | `{ path, agentType }` | Tree node removed |
| `file.lock_acquired` | `{ paths[], agentType }` | Lock indicator |
| `file.lock_released` | `{ paths[] }` | Lock cleared |

### Build & Test Events

| Type | Payload | UI Impact |
|------|---------|-----------|
| `build.started` | `{ buildRunId }` | Build spinner |
| `build.log` | `{ line, level }` | Build log panel (sanitized) |
| `build.completed` | `{ duration, success }` | Pass/fail badge |
| `build.failed` | `{ errors[], summary }` | Plain-English error card |
| `test.started` | `{ suite }` | Test spinner |
| `test.completed` | `{ passed, failed, skipped }` | Test results |
| `test.failed` | `{ failures[] }` | Failure details |

### Preview Events

| Type | Payload | UI Impact |
|------|---------|-----------|
| `preview.provisioning` | `{}` | "Starting preview..." |
| `preview.ready` | `{ url, expiresAt }` | iframe loads |
| `preview.updated` | `{ trigger: "file_change" }` | iframe refresh |
| `preview.error` | `{ error }` | Preview error overlay |
| `preview.stopped` | `{ reason }` | Preview placeholder |

### GitHub Events

| Type | Payload | UI Impact |
|------|---------|-----------|
| `github.repo.created` | `{ url, name }` | GitHub link |
| `github.branch.created` | `{ name }` | Branch badge |
| `github.commit.pushed` | `{ sha, message, url }` | Commit in timeline |
| `github.pr.created` | `{ number, url, title }` | PR link |
| `github.pr.merged` | `{ number }` | Merged badge |

### Project Events

| Type | Payload | UI Impact |
|------|---------|-----------|
| `project.status.changed` | `{ from, to }` | Status bar |
| `project.cost.updated` | `{ totalUsd, budgetUsd, percent }` | Cost meter |
| `milestone.completed` | `{ milestoneId, title }` | Progress bar advance |

## Event Flow: Full Build

```mermaid
sequenceDiagram
    participant U as User
    participant API as API
    participant WF as Workflow
    participant EB as Event Bus
    participant WS as WebSocket
    participant UI as Workspace

    U->>API: POST /projects { prompt }
    API->>WF: start workflow
    WF->>EB: workflow.started
    EB->>WS->>UI: Pipeline appears

    WF->>EB: workflow.node.started { requirements }
    WF->>EB: clarification.requested
    EB->>WS->>UI: Questions in chat
    U->>API: POST clarifications/answer
    API->>WF: resume signal
    WF->>EB: artifact.created { specification }
    WF->>EB: workflow.node.completed

    Note over WF,EB: ... planning, architecture ...

    par Parallel generation
        WF->>EB: file.created (UI files)
        WF->>EB: file.created (API routes)
        WF->>EB: file.created (migrations)
    end

    WF->>EB: build.started
    WF->>EB: build.completed { success: true }
    WF->>EB: test.completed { passed: 42, failed: 0 }
    WF->>EB: github.commit.pushed
    WF->>EB: preview.ready { url }
    WF->>EB: workflow.completed
    EB->>WS->>UI: Full app in preview iframe
```

## Delivery Guarantees

| Path | Guarantee | Mechanism |
|------|-----------|-----------|
| Agent → Event Bus | At-least-once | Redis Streams XADD with ACK |
| Event Bus → WebSocket | At-least-once | Consumer group with retry |
| Event Bus → Audit DB | Exactly-once | Idempotent insert on `event.id` |
| Event Bus → Workflow Trigger | Exactly-once | Temporal signal idempotency key |

## WebSocket Protocol (v2)

### Connection

```
wss://api.nebula.ai/v2/ws?token={jwt}
```

### Subscribe

```json
{ "action": "subscribe", "projectId": "uuid", "fromEventId": "uuid?" }
```

`fromEventId` enables catch-up: server replays missed events from Redis Stream.

### Server Message Format

```json
{
  "event": "file.created",
  "data": { "path": "src/app/page.tsx", "agentType": "ui_generation", "version": 1 },
  "id": "01932a8c-...",
  "timestamp": "2026-06-06T14:00:00Z"
}
```

### Client Actions

| Action | Purpose |
|--------|---------|
| `subscribe` | Join project event stream |
| `unsubscribe` | Leave project stream |
| `catch_up` | Replay from event ID |
| `ping` | Keepalive (30s interval) |

## Event Storage & Retention

| Store | Contents | Retention |
|-------|----------|-----------|
| Redis Streams `project:{id}` | Hot events for WS fanout | 7 days |
| PostgreSQL `orchestration_events` | Full audit trail | 90 days |
| S3 `events/archive/{projectId}` | Cold archive | 1 year |
| Prometheus | Aggregated metrics | 30 days |

### Stream Trimming

```
MAXLEN ~ 10000 per project stream
Archive to S3 before trim via background job
```

## Event-Driven Workflow Triggering

The workflow engine is a **consumer** of agent events, not a caller:

```typescript
// Temporal activity completion handler
onEvent("agent.run.completed", async (event) => {
  const { workflowRunId, agentRunId } = event;
  const node = await getNodeForAgentRun(agentRunId);

  if (event.payload.status === "failed" && node.retryPolicy) {
    await scheduleRetry(node, event.payload.error);
    return;
  }

  const nextNodes = evaluateDAG(workflowRunId, node.id, event.payload);
  for (const next of nextNodes) {
    await enqueueNode(next);
  }
});
```

## Metrics Derived from Events

| Metric | Source Events |
|--------|--------------|
| Agent success rate | `agent.run.completed` / `agent.run.failed` |
| P95 build time | `build.completed.duration` |
| Cost per project | Sum of `agent.run.token_usage.costUsd` |
| Preview uptime | `preview.ready` → `preview.stopped` |
| User wait time at gates | `workflow.paused` → `workflow.resumed` |

## Migration from Phase 1 Events

| Phase 1 Event | v2 Equivalent |
|--------------|---------------|
| `agent.run.started` | Unchanged |
| `task.created` | `milestone.created` + `workflow.node.started` |
| `file.created` | Unchanged + `agentType` field added |
| `commit.pushed` | `github.commit.pushed` |
| `project.status.changed` | Unchanged |

Phase 1 WebSocket clients: v2 gateway translates v2 events to v1 format for 6 months.
