-- Phase 1: project agent rules for Cursor-style custom instructions
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "agent_rules" TEXT;
