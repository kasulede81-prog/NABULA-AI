-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN "error_code" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "failure_phase" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "retry_count" INTEGER;
