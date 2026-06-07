/**
 * Admin Dashboard V1 — static verification.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

console.log("Admin Dashboard V1 Verification\n");

const adminService = read("apps/api/src/services/admin-dashboard.service.ts");
const adminRoutes = read("apps/api/src/routes/admin.routes.ts");
const adminPage = read("apps/web/src/app/admin/page.tsx");
const apiClient = read("apps/web/src/lib/api.ts");
const analytics = read("apps/api/src/services/analytics.service.ts");

check("admin-dashboard service", adminService.includes("AdminDashboardService"));
check("overview metrics", adminService.includes("getOverview"));
check("list users", adminService.includes("listUsers"));
check("suspend user", adminService.includes("suspendUser"));
check("reactivate user", adminService.includes("reactivateUser"));
check("upgrade pro", adminService.includes("upgradeUserToPro"));
check("reset build limits", adminService.includes("resetBuildLimits"));
check("build monitoring", adminService.includes("listBuildRuns"));
check("preview monitoring", adminService.includes("listPreviews"));
check("stop preview", adminService.includes("stopPreview"));
check("delete preview", adminService.includes("deletePreview"));
check("ai analytics charts data", adminService.includes("getAiAnalytics"));
check("system health", adminService.includes("getSystemHealth"));
check("audit logs", adminService.includes("getAuditLogs"));

check("overview route", adminRoutes.includes("/admin/dashboard/overview"));
check("users route", adminRoutes.includes("/admin/users"));
check("builds route", adminRoutes.includes("/admin/builds"));
check("previews route", adminRoutes.includes("/admin/previews"));
check("ai-analytics route", adminRoutes.includes("/admin/ai-analytics"));
check("health route", adminRoutes.includes("/admin/health"));
check("audit-logs route", adminRoutes.includes("/admin/audit-logs"));
check("admin middleware hooks", adminRoutes.includes("requireAdmin"));

check("USER_UPGRADED event", analytics.includes("USER_UPGRADED"));

check("admin page exists", adminPage.includes("Admin Dashboard"));
check("overview section", adminPage.includes("Overview"));
check("user management section", adminPage.includes("User Management"));
check("build monitoring section", adminPage.includes("Build Monitoring"));
check("preview monitoring section", adminPage.includes("Preview Monitoring"));
check("ai analytics section", adminPage.includes("AI Analytics"));
check("system health section", adminPage.includes("System Health"));
check("audit logs section", adminPage.includes("Audit Logs"));

check("api client overview", apiClient.includes("getAdminOverview"));
check("api client user actions", apiClient.includes("suspendUser"));
check("api client previews", apiClient.includes("getAdminPreviews"));

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
