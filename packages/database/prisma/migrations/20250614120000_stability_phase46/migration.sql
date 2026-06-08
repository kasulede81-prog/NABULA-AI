-- Phase 4.6: Launch readiness & stability

CREATE TYPE "ErrorSource" AS ENUM ('api', 'preview', 'github', 'ai_provider');

CREATE TYPE "FeedbackCategory" AS ENUM ('bug', 'feature', 'general', 'other');

CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'reviewed', 'closed');

CREATE TYPE "StabilityAuditAction" AS ENUM (
  'error_logged',
  'feedback_submitted',
  'build_retried',
  'preview_retried',
  'github_sync_retried'
);

ALTER TYPE "AdminAuditAction" ADD VALUE 'build_retried';
ALTER TYPE "AdminAuditAction" ADD VALUE 'preview_retried';
ALTER TYPE "AdminAuditAction" ADD VALUE 'github_sync_retried';

ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);

CREATE TABLE "error_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fingerprint" TEXT NOT NULL,
  "source" "ErrorSource" NOT NULL,
  "code" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "error_logs_fingerprint_key" ON "error_logs"("fingerprint");
CREATE INDEX "error_logs_source_last_seen_at_idx" ON "error_logs"("source", "last_seen_at");

CREATE TABLE "error_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "error_log_id" UUID NOT NULL,
  "source" "ErrorSource" NOT NULL,
  "code" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "user_id" UUID,
  "project_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "error_events_source_created_at_idx" ON "error_events"("source", "created_at");
CREATE INDEX "error_events_error_log_id_created_at_idx" ON "error_events"("error_log_id", "created_at");
CREATE INDEX "error_events_user_id_created_at_idx" ON "error_events"("user_id", "created_at");

ALTER TABLE "error_events"
  ADD CONSTRAINT "error_events_error_log_id_fkey"
  FOREIGN KEY ("error_log_id") REFERENCES "error_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "error_events"
  ADD CONSTRAINT "error_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "feedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "category" "FeedbackCategory" NOT NULL DEFAULT 'general',
  "message" TEXT NOT NULL,
  "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_status_created_at_idx" ON "feedback"("status", "created_at");
CREATE INDEX "feedback_user_id_created_at_idx" ON "feedback"("user_id", "created_at");

ALTER TABLE "feedback"
  ADD CONSTRAINT "feedback_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stability_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "action" "StabilityAuditAction" NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stability_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stability_audit_logs_action_created_at_idx" ON "stability_audit_logs"("action", "created_at");
CREATE INDEX "stability_audit_logs_user_id_created_at_idx" ON "stability_audit_logs"("user_id", "created_at");

ALTER TABLE "stability_audit_logs"
  ADD CONSTRAINT "stability_audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
