-- Preview lifecycle: cost tracking + expiration index
ALTER TABLE "previews" ADD COLUMN "started_at" TIMESTAMP(3);
ALTER TABLE "previews" ADD COLUMN "estimated_cost_usd" DOUBLE PRECISION;

CREATE INDEX "previews_status_expires_at_idx" ON "previews"("status", "expires_at");
