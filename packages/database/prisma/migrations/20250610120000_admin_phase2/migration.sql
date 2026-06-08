-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM (
  'admin_login',
  'user_suspended',
  'user_reactivated',
  'user_quota_reset',
  'user_upgraded',
  'project_deleted',
  'project_force_rebuild',
  'preview_restart',
  'preview_stopped',
  'preview_deleted'
);

-- CreateEnum
CREATE TYPE "SystemServiceStatus" AS ENUM ('healthy', 'degraded', 'down', 'unknown');

-- CreateTable
CREATE TABLE "admin_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "admin_user_id" UUID NOT NULL,
  "action" "AdminAuditAction" NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "target_label" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_metrics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "service" TEXT NOT NULL,
  "status" "SystemServiceStatus" NOT NULL DEFAULT 'unknown',
  "latency_ms" INTEGER,
  "details" JSONB,
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_metrics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "date" DATE NOT NULL,
  "provider" TEXT NOT NULL,
  "request_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "tokens_input" INTEGER NOT NULL DEFAULT 0,
  "tokens_output" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "usage_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_created_at_idx" ON "admin_audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_user_id_created_at_idx" ON "admin_audit_logs"("admin_user_id", "created_at");

-- CreateIndex
CREATE INDEX "system_metrics_service_checked_at_idx" ON "system_metrics"("service", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_metrics_date_provider_key" ON "usage_metrics"("date", "provider");

-- CreateIndex
CREATE INDEX "usage_metrics_date_idx" ON "usage_metrics"("date");

-- AddForeignKey
ALTER TABLE "admin_audit_logs"
  ADD CONSTRAINT "admin_audit_logs_admin_user_id_fkey"
  FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
