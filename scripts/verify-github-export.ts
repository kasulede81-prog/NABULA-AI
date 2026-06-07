/**
 * Phase 4A GitHub Export MVP — static verification (no GitHub API calls).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SseEvents } from "@nebula/shared";

const ROOT = resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

console.log("GitHub Export MVP Verification\n");

const schema = read("packages/database/prisma/schema.prisma");
const migration = read(
  "packages/database/prisma/migrations/20250608120000_github_export/migration.sql"
);
const githubService = read("apps/api/src/services/github.service.ts");
const githubRoutes = read("apps/api/src/routes/github.routes.ts");
const tokenCrypto = read("apps/api/src/lib/token-crypto.ts");
const panel = read("apps/web/src/components/workspace/GitHubExportPanel.tsx");
const apiClient = read("apps/web/src/lib/api.ts");
const workspace = read("apps/web/src/app/projects/[id]/page.tsx");

check("GithubConnection model", schema.includes("model GithubConnection"));
check("project github_repo_url", schema.includes("githubRepoUrl"));
check("migration creates github_connections", migration.includes("github_connections"));
check("migration adds project github columns", migration.includes("github_repo_url"));

check("github.service exists", githubService.includes("class GithubService"));
check("encrypts PAT", githubService.includes("encryptSecret"));
check("creates repository", githubService.includes("/user/repos"));
check("git tree initial commit", githubService.includes("/git/trees"));
check("single main ref", githubService.includes("refs/heads/main"));
check("no branch API", !githubService.includes("/git/refs/heads/"));
check("no pull request API", !githubService.includes("/pulls"));
check("requires ready status", githubService.includes('project.status !== "ready"'));
check("uses VFS snapshot", githubService.includes("vfsService.snapshot"));

check("GET connection route", githubRoutes.includes('get("/github/connection"'));
check("PUT connection route", githubRoutes.includes('put("/github/connection"'));
check("POST export route", githubRoutes.includes('post("/projects/:projectId/github/export"'));
check("routes registered", read("apps/api/src/app.ts").includes("githubRoutes"));

check("token crypto AES-GCM", tokenCrypto.includes("aes-256-gcm"));

check("SSE export events", SseEvents.GITHUB_EXPORT_STARTED === "github.export.started");
check("SSE completed event", SseEvents.GITHUB_EXPORT_COMPLETED === "github.export.completed");

check("GitHubExportPanel component", panel.includes("GitHubExportPanel"));
check("export button", panel.includes("Export to GitHub"));
check("PAT input", panel.includes("type=\"password\""));
check("workspace header integration", workspace.includes("GitHubExportPanel"));

check("api getGithubConnection", apiClient.includes("getGithubConnection"));
check("api exportToGithub", apiClient.includes("exportToGithub"));

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
