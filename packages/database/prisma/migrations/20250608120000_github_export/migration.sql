-- GitHub PAT connection (per user) and project export metadata
CREATE TABLE "github_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_enc" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "github_connections_user_id_key" ON "github_connections"("user_id");

ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects" ADD COLUMN "github_repo_url" TEXT;
ALTER TABLE "projects" ADD COLUMN "github_repo_full_name" TEXT;
ALTER TABLE "projects" ADD COLUMN "github_exported_at" TIMESTAMP(3);
