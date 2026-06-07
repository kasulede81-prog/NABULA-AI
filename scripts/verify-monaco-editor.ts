/**
 * Phase 4C Monaco Editor + AI Edit — static verification.
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

console.log("Monaco Editor MVP Verification\n");

const monacoPanel = read("apps/web/src/components/workspace/MonacoEditorPanel.tsx");
const aiModal = read("apps/web/src/components/workspace/AiEditModal.tsx");
const workspace = read("apps/web/src/app/projects/[id]/page.tsx");
const aiEdit = read("apps/api/src/services/ai-edit.service.ts");
const filesRoutes = read("apps/api/src/routes/files.routes.ts");
const vfs = read("apps/api/src/services/vfs.service.ts");

check("monaco package", read("apps/web/package.json").includes("@monaco-editor/react"));
check("MonacoEditorPanel", monacoPanel.includes("MonacoEditor"));
check("editor tabs", monacoPanel.includes("tabs.map"));
check("unsaved indicator", monacoPanel.includes("dirty"));
check("save button", monacoPanel.includes("Save"));
check("AI Edit button", monacoPanel.includes("AI Edit"));

check("language mapping ts", read("apps/web/src/lib/monaco-language.ts").includes("typescript"));
check("language mapping prisma", read("apps/web/src/lib/monaco-language.ts").includes("sql"));

check("preview when no file", workspace.includes("PreviewPanel"));
check("monaco when file selected", workspace.includes("MonacoEditorPanel"));

check("ai edit service", aiEdit.includes("proposeEdit"));
check("single file only", aiEdit.includes("path: string") && !aiEdit.includes("writeFiles"));
check("no tool calls", !aiEdit.includes("tools:"));
check("1mb limit", aiEdit.includes("1_000_000") || aiEdit.includes("MAX_FILE_BYTES"));

check("ai-edit route", filesRoutes.includes("/files/ai-edit"));
check("ai-edit apply route", filesRoutes.includes("/files/ai-edit/apply"));
check("rename route", filesRoutes.includes("/files/rename"));
check("vfs rename", vfs.includes("renameFile"));
check("vfs path schema", read("packages/shared/src/schemas/file.ts").includes("renameFileSchema"));

check("diff preview", aiModal.includes("DiffEditor"));
check("apply button", aiModal.includes("Apply"));

check("files_opened metric", read("apps/api/src/services/analytics.service.ts").includes("FILES_OPENED"));
check("ai_edits metrics", read("apps/api/src/services/analytics.service.ts").includes("AI_EDITS_APPLIED"));

check("builder unchanged", !read("apps/api/src/services/builder.service.ts").includes("ai-edit"));
check("no terminal", !monacoPanel.toLowerCase().includes("terminal"));

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
