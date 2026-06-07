-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN "tool_calls" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "files_generated" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "build_duration_ms" INTEGER;
