-- Phase 5: workspace notifications

CREATE TABLE IF NOT EXISTS "project_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "read" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "project_notifications_project_read_idx"
  ON "project_notifications"("project_id", "read", "created_at" DESC);

ALTER TABLE "project_notifications"
  ADD CONSTRAINT "project_notifications_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_notifications"
  ADD CONSTRAINT "project_notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
