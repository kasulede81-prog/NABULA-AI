-- Phase 3: file version history + codebase symbol index

CREATE TABLE IF NOT EXISTS "file_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "path" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'user',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "file_versions_project_path_version_key"
  ON "file_versions"("project_id", "path", "version");
CREATE INDEX IF NOT EXISTS "file_versions_project_created_idx"
  ON "file_versions"("project_id", "created_at" DESC);

ALTER TABLE "file_versions"
  ADD CONSTRAINT "file_versions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "code_index_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "path" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "line" INTEGER NOT NULL,
  "column" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "code_index_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "code_index_entries_unique_symbol"
  ON "code_index_entries"("project_id", "path", "kind", "name", "line");
CREATE INDEX IF NOT EXISTS "code_index_entries_project_name_idx"
  ON "code_index_entries"("project_id", "name");

ALTER TABLE "code_index_entries"
  ADD CONSTRAINT "code_index_entries_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
