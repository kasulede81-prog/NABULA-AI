-- Phase 4.5: Manual upgrade requests & support chat

CREATE TYPE "UpgradeRequestStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "SupportConversationStatus" AS ENUM ('open', 'closed');
CREATE TYPE "SupportSenderType" AS ENUM ('user', 'admin');
CREATE TYPE "SupportAuditAction" AS ENUM (
  'upgrade_requested',
  'upgrade_approved',
  'upgrade_rejected',
  'support_message_sent'
);

CREATE TABLE "upgrade_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "requested_plan" "PlanTier" NOT NULL DEFAULT 'pro',
  "status" "UpgradeRequestStatus" NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "upgrade_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "upgrade_requests_status_created_at_idx" ON "upgrade_requests"("status", "created_at");
CREATE INDEX "upgrade_requests_user_id_status_idx" ON "upgrade_requests"("user_id", "status");

ALTER TABLE "upgrade_requests"
  ADD CONSTRAINT "upgrade_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "support_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "status" "SupportConversationStatus" NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_conversations_user_id_status_idx" ON "support_conversations"("user_id", "status");
CREATE INDEX "support_conversations_status_updated_at_idx" ON "support_conversations"("status", "updated_at");

ALTER TABLE "support_conversations"
  ADD CONSTRAINT "support_conversations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "support_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "sender_type" "SupportSenderType" NOT NULL,
  "sender_user_id" UUID,
  "message" TEXT NOT NULL,
  "read_by_user" BOOLEAN NOT NULL DEFAULT false,
  "read_by_admin" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_messages_conversation_id_created_at_idx"
  ON "support_messages"("conversation_id", "created_at");

ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "support_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "support_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "action" "SupportAuditAction" NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_audit_logs_user_id_created_at_idx" ON "support_audit_logs"("user_id", "created_at");
CREATE INDEX "support_audit_logs_action_created_at_idx" ON "support_audit_logs"("action", "created_at");

ALTER TABLE "support_audit_logs"
  ADD CONSTRAINT "support_audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
