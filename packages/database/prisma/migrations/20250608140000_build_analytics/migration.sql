-- Build analytics: provider + cost on agent runs; workspace/editor event log
ALTER TABLE "agent_runs" ADD COLUMN "llm_provider" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "estimated_cost_usd" DOUBLE PRECISION;

CREATE INDEX "agent_runs_agent_type_status_idx" ON "agent_runs"("agent_type", "status");

CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_type" TEXT NOT NULL,
    "user_id" UUID,
    "project_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_events_event_type_created_at_idx"
    ON "analytics_events"("event_type", "created_at");

ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
