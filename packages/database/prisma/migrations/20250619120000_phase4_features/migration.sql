-- Phase 4: MCP config, background agent queue

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "mcp_servers" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "mcp_allow_writes" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "AgentQueueJobKind" AS ENUM ('pipeline', 'clarifier', 'builder');
CREATE TYPE "AgentQueueJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE IF NOT EXISTS "agent_queue_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" "AgentQueueJobKind" NOT NULL,
  "status" "AgentQueueJobStatus" NOT NULL DEFAULT 'pending',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "wait_for_idle" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "agent_queue_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_queue_jobs_status_priority_idx"
  ON "agent_queue_jobs"("status", "priority" DESC, "created_at" ASC);
CREATE INDEX IF NOT EXISTS "agent_queue_jobs_project_idx"
  ON "agent_queue_jobs"("project_id", "created_at" DESC);

ALTER TABLE "agent_queue_jobs"
  ADD CONSTRAINT "agent_queue_jobs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_queue_jobs"
  ADD CONSTRAINT "agent_queue_jobs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
