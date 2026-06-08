-- GitHub Phase 3: OAuth fields, repositories table, audit logs

-- Extend github_connections
ALTER TABLE "github_connections" RENAME COLUMN "token_enc" TO "encrypted_access_token";
ALTER TABLE "github_connections" ADD COLUMN "github_user_id" TEXT;
ALTER TABLE "github_connections" ADD COLUMN "token_type" TEXT NOT NULL DEFAULT 'pat';

-- CreateEnum
CREATE TYPE "GithubAuditAction" AS ENUM (
  'github_connected',
  'github_disconnected',
  'repository_created',
  'repository_synced',
  'repository_sync_failed'
);

-- CreateTable github_repositories
CREATE TABLE "github_repositories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "repository_name" TEXT NOT NULL,
  "repository_url" TEXT NOT NULL,
  "default_branch" TEXT NOT NULL DEFAULT 'main',
  "last_commit_sha" TEXT,
  "last_synced_at" TIMESTAMP(3),
  "file_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "github_repositories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_repositories_project_id_key" ON "github_repositories"("project_id");
CREATE INDEX "github_repositories_connection_id_idx" ON "github_repositories"("connection_id");

ALTER TABLE "github_repositories"
  ADD CONSTRAINT "github_repositories_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "github_repositories"
  ADD CONSTRAINT "github_repositories_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "github_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable github_audit_logs
CREATE TABLE "github_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "project_id" UUID,
  "action" "GithubAuditAction" NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "github_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "github_audit_logs_user_id_created_at_idx" ON "github_audit_logs"("user_id", "created_at");
CREATE INDEX "github_audit_logs_action_created_at_idx" ON "github_audit_logs"("action", "created_at");
