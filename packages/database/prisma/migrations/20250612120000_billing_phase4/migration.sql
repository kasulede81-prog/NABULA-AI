-- Phase 4: Billing, credits & usage tracking

-- CreateEnum
CREATE TYPE "CreditLedgerType" AS ENUM (
  'monthly_grant',
  'daily_grant',
  'consumption',
  'admin_adjustment',
  'refund'
);

CREATE TYPE "UsageEventType" AS ENUM (
  'project_created',
  'ai_generation',
  'builder_run',
  'preview_launch',
  'github_export'
);

CREATE TYPE "BillingAuditAction" AS ENUM (
  'quota_exceeded',
  'credits_consumed',
  'credits_granted',
  'plan_changed'
);

-- Extend subscriptions
ALTER TABLE "subscriptions" ADD COLUMN "credits_balance" INTEGER NOT NULL DEFAULT 100;
UPDATE "subscriptions" SET "credits_balance" = 100 WHERE "credits_balance" = 0;
ALTER TABLE "subscriptions" ALTER COLUMN "builds_limit" SET DEFAULT 20;

-- CreateTable credit_ledger
CREATE TABLE "credit_ledger" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" "CreditLedgerType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_ledger_user_id_created_at_idx" ON "credit_ledger"("user_id", "created_at");

ALTER TABLE "credit_ledger"
  ADD CONSTRAINT "credit_ledger_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable usage_events
CREATE TABLE "usage_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "project_id" UUID,
  "event_type" "UsageEventType" NOT NULL,
  "credits_consumed" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "usage_events_user_id_event_type_created_at_idx"
  ON "usage_events"("user_id", "event_type", "created_at");
CREATE INDEX "usage_events_project_id_created_at_idx"
  ON "usage_events"("project_id", "created_at");

ALTER TABLE "usage_events"
  ADD CONSTRAINT "usage_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable billing_audit_logs
CREATE TABLE "billing_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "action" "BillingAuditAction" NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_audit_logs_user_id_created_at_idx"
  ON "billing_audit_logs"("user_id", "created_at");
CREATE INDEX "billing_audit_logs_action_created_at_idx"
  ON "billing_audit_logs"("action", "created_at");

ALTER TABLE "billing_audit_logs"
  ADD CONSTRAINT "billing_audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
