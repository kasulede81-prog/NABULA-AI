-- Phase A: Performance indexes

CREATE INDEX "projects_status_idx" ON "projects"("status");

CREATE INDEX "projects_created_at_idx" ON "projects"("created_at");

CREATE INDEX "agent_runs_created_at_idx" ON "agent_runs"("created_at");

CREATE INDEX "agent_runs_user_id_idx" ON "agent_runs"("user_id");

CREATE INDEX "previews_updated_at_idx" ON "previews"("updated_at");
