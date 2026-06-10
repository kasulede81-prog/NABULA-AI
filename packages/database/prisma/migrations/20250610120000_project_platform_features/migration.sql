-- CreateEnum
CREATE TYPE "DeployTarget" AS ENUM ('vercel', 'netlify', 'mock');

-- CreateEnum
CREATE TYPE "DeployStatus" AS ENUM ('queued', 'building', 'deploying', 'ready', 'error', 'canceled');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('pending', 'active', 'failed');

-- CreateTable
CREATE TABLE "project_env_vars" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "is_secret" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_env_vars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "triggered_by_id" UUID,
    "target" "DeployTarget" NOT NULL DEFAULT 'mock',
    "status" "DeployStatus" NOT NULL DEFAULT 'queued',
    "url" TEXT,
    "commit_message" TEXT,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "external_id" TEXT,
    "logs" JSONB NOT NULL DEFAULT '[]',
    "env_snapshot" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_domains" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "host" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_notes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_recordings" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID,
    "title" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "transcript" TEXT NOT NULL DEFAULT '',
    "audio_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_env_vars_project_id_idx" ON "project_env_vars"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_env_vars_project_id_key_environment_key" ON "project_env_vars"("project_id", "key", "environment");

-- CreateIndex
CREATE INDEX "deployments_project_id_created_at_idx" ON "deployments"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "project_domains_project_id_idx" ON "project_domains"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_domains_project_id_host_key" ON "project_domains"("project_id", "host");

-- CreateIndex
CREATE INDEX "project_notes_project_id_updated_at_idx" ON "project_notes"("project_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "project_recordings_project_id_created_at_idx" ON "project_recordings"("project_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "project_env_vars" ADD CONSTRAINT "project_env_vars_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_domains" ADD CONSTRAINT "project_domains_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_recordings" ADD CONSTRAINT "project_recordings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
