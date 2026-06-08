-- Phase 5: Team workspaces & collaboration

CREATE TYPE "WorkspaceMemberRole" AS ENUM ('owner', 'admin', 'member');

CREATE TYPE "WorkspaceInvitationStatus" AS ENUM ('pending', 'accepted', 'expired');

CREATE TYPE "ProjectVisibility" AS ENUM ('personal', 'workspace');

CREATE TYPE "WorkspaceAuditAction" AS ENUM (
  'workspace_created',
  'workspace_deleted',
  'member_invited',
  'member_joined',
  'member_removed',
  'role_changed',
  'ownership_transferred'
);

CREATE TABLE "workspaces" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "owner_id" UUID NOT NULL,
  "plan" "PlanTier" NOT NULL DEFAULT 'free',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");
CREATE INDEX "workspaces_owner_id_idx" ON "workspaces"("owner_id");

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "workspace_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'member',
  "invited_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key"
  ON "workspace_members"("workspace_id", "user_id");
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

ALTER TABLE "workspace_members"
  ADD CONSTRAINT "workspace_members_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_members"
  ADD CONSTRAINT "workspace_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "workspace_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'member',
  "token" TEXT NOT NULL,
  "status" "WorkspaceInvitationStatus" NOT NULL DEFAULT 'pending',
  "invited_by" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_invitations_token_key" ON "workspace_invitations"("token");
CREATE INDEX "workspace_invitations_workspace_id_status_idx"
  ON "workspace_invitations"("workspace_id", "status");
CREATE INDEX "workspace_invitations_email_status_idx"
  ON "workspace_invitations"("email", "status");

ALTER TABLE "workspace_invitations"
  ADD CONSTRAINT "workspace_invitations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_invitations"
  ADD CONSTRAINT "workspace_invitations_invited_by_fkey"
  FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "workspace_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "user_id" UUID,
  "action" "WorkspaceAuditAction" NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_audit_logs_workspace_id_created_at_idx"
  ON "workspace_audit_logs"("workspace_id", "created_at");
CREATE INDEX "workspace_audit_logs_action_created_at_idx"
  ON "workspace_audit_logs"("action", "created_at");

ALTER TABLE "workspace_audit_logs"
  ADD CONSTRAINT "workspace_audit_logs_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_audit_logs"
  ADD CONSTRAINT "workspace_audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects"
  ADD COLUMN "workspace_id" UUID,
  ADD COLUMN "visibility" "ProjectVisibility" NOT NULL DEFAULT 'personal';

CREATE INDEX "projects_workspace_id_idx" ON "projects"("workspace_id");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "projects_workspace_id_slug_key"
  ON "projects"("workspace_id", "slug");

ALTER TABLE "github_repositories"
  ADD COLUMN "created_by_user_id" UUID,
  ADD COLUMN "last_synced_by_user_id" UUID;
