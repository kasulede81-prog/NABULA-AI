-- CreateEnum
CREATE TYPE "PreviewPhase" AS ENUM (
  'preparing_sandbox',
  'installing_dependencies',
  'building_project',
  'starting_server',
  'waiting_for_health_check',
  'preview_ready',
  'failed'
);

-- CreateEnum
CREATE TYPE "PreviewLogLevel" AS ENUM ('info', 'warn', 'error', 'stdout', 'stderr');

-- CreateEnum
CREATE TYPE "PreviewLogSource" AS ENUM ('system', 'install', 'build', 'runtime', 'health');

-- AlterTable
ALTER TABLE "previews"
  ADD COLUMN "phase" "PreviewPhase" NOT NULL DEFAULT 'preparing_sandbox',
  ADD COLUMN "detected_port" INTEGER,
  ADD COLUMN "framework" TEXT,
  ADD COLUMN "package_manager" TEXT,
  ADD COLUMN "error_code" TEXT,
  ADD COLUMN "error_message" TEXT;

-- CreateTable
CREATE TABLE "preview_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "preview_id" UUID NOT NULL,
  "level" "PreviewLogLevel" NOT NULL DEFAULT 'info',
  "source" "PreviewLogSource" NOT NULL DEFAULT 'system',
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "preview_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preview_logs_preview_id_created_at_idx" ON "preview_logs"("preview_id", "created_at");

-- AddForeignKey
ALTER TABLE "preview_logs"
  ADD CONSTRAINT "preview_logs_preview_id_fkey"
  FOREIGN KEY ("preview_id") REFERENCES "previews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
