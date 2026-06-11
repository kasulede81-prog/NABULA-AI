-- Phase 6: DB-backed pending changesets (multi-instance safe)

CREATE TABLE IF NOT EXISTS "pending_changeset_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "path" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "previous_content" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pending_changeset_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pending_changeset_entries_project_path_key"
  ON "pending_changeset_entries"("project_id", "path");

CREATE INDEX IF NOT EXISTS "pending_changeset_entries_project_idx"
  ON "pending_changeset_entries"("project_id");

ALTER TABLE "pending_changeset_entries"
  ADD CONSTRAINT "pending_changeset_entries_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
