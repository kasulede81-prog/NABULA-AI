/**
 * Verifies shared VFS path validation rejects traversal and invalid paths.
 */
import { validateVfsPath } from "@nebula/shared";

interface Case {
  path: string;
  shouldPass: boolean;
}

const cases: Case[] = [
  { path: "src/app/page.tsx", shouldPass: true },
  { path: "prisma/schema.prisma", shouldPass: true },
  { path: "../etc/passwd", shouldPass: false },
  { path: "../../secret", shouldPass: false },
  { path: "/absolute/path", shouldPass: false },
  { path: "src\\app\\page.tsx", shouldPass: false },
  { path: "src/foo/../bar.ts", shouldPass: false },
  { path: "src//double.ts", shouldPass: false },
  { path: " trailing.ts", shouldPass: false },
  { path: "src/dir/", shouldPass: false },
  { path: "", shouldPass: false },
];

let passed = 0;
let failed = 0;

console.log("VFS Path Security Verification\n");

for (const c of cases) {
  const result = validateVfsPath(c.path);
  const ok = result.ok === c.shouldPass;
  const icon = ok ? "PASS" : "FAIL";
  console.log(
    `[${icon}] ${JSON.stringify(c.path)} → ${result.ok ? "allowed" : result.ok === false ? `blocked: ${(result as { message: string }).message}` : "allowed"}`
  );
  if (ok) passed++;
  else failed++;
}

console.log(`\n--- ${passed}/${cases.length} passed ---`);
process.exit(failed > 0 ? 1 : 0);
