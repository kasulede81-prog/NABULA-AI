/**
 * Verifies write_files parser hardening and recovery rules.
 */
import {
  parseWriteFilesInput,
  recoverFilesFromMalformedJsonString,
  WriteFilesParseError,
  normalizeWriteFilesInput,
} from "@nebula/shared";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

function expectThrow(name: string, fn: () => void) {
  try {
    fn();
    check(name, false);
  } catch (err) {
    check(name, err instanceof WriteFilesParseError);
  }
}

console.log("write_files Parser Verification\n");

// --- Standard formats ---

const array = parseWriteFilesInput({
  files: [{ path: "src/app/page.tsx", content: "export default function Page() {}" }],
});
check("array payload", array.files.length === 1 && !array.recovered);

const objectMap = parseWriteFilesInput({
  files: {
    "0": { path: "src/lib/a.ts", content: "export const a = 1" },
    "1": { path: "src/lib/b.ts", content: "export const b = 2" },
  },
});
check("object map payload", objectMap.files.length === 2);

const singleObject = parseWriteFilesInput({
  files: { path: "src/lib/utils.ts", content: "export function cn() {}" },
});
check("single file object", singleObject.files[0]?.path === "src/lib/utils.ts");

const topLevel = parseWriteFilesInput({
  path: "src/lib/prisma.ts",
  content: "export const prisma = {}",
});
check("top-level path/content", topLevel.files[0]?.path === "src/lib/prisma.ts");

const jsonString = parseWriteFilesInput({
  files: JSON.stringify([{ path: "src/lib/db.ts", content: "export {}" }]),
});
check("JSON string array", jsonString.files.length === 1);

const nested = parseWriteFilesInput({
  input: {
    files: [{ path: "package.json", content: "{}" }],
  },
});
check("nested tool input", nested.files.length === 1 && nested.recovered);

// --- Recovery: unquoted TypeScript content (trace pattern) ---

const unquotedTs = `
[
  {
    "path": "src/app/api/dashboard/route.ts",
    "content": import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return NextResponse.json({ ok: true });
}
  }
]`;

const recoveredTs = parseWriteFilesInput({ files: unquotedTs });
check(
  "recovers unquoted TypeScript content",
  recoveredTs.files.length === 1 &&
    recoveredTs.files[0]?.path === "src/app/api/dashboard/route.ts" &&
    recoveredTs.files[0]?.content.includes("NextResponse") &&
    recoveredTs.recovered
);

const jsxContent = `
[{
  "path": "src/app/page.tsx",
  "content": export default function Page() {
  return <main className="p-4">Hello</main>;
}
}]`;

const recoveredJsx = parseWriteFilesInput({ files: jsxContent });
check(
  "recovers unquoted JSX content",
  recoveredJsx.files[0]?.content.includes("<main") && recoveredJsx.recovered
);

const quotedWithEscapes = parseWriteFilesInput({
  files: [
    {
      path: "src/app/layout.tsx",
      content: 'import "./globals.css"\\nexport default function Layout() {}',
    },
  ],
});
check(
  "handles escaped JSON in content field",
  quotedWithEscapes.files[0]?.content.includes("globals.css")
);

const doubleEncoded = parseWriteFilesInput({
  files: JSON.stringify(
    JSON.stringify([{ path: "prisma/schema.prisma", content: "model User { id Int @id }" }])
  ),
});
check("decodes double-encoded JSON string", doubleEncoded.files.length === 1 && doubleEncoded.recovered);

// --- Recovery unit: malformed string extractor ---

const extracted = recoverFilesFromMalformedJsonString(unquotedTs);
check("extractor finds dashboard path", extracted[0]?.path.includes("dashboard"));

// --- Failure cases: throw immediately ---

expectThrow("empty payload throws", () => parseWriteFilesInput({}));
expectThrow("null files throws", () => parseWriteFilesInput({ files: null }));
expectThrow("invalid path throws", () =>
  parseWriteFilesInput({ files: [{ path: "../evil.ts", content: "x" }] })
);
expectThrow("unrecoverable string throws", () =>
  parseWriteFilesInput({ files: "not json at all {{{" })
);

// --- normalizeWriteFilesInput never throws ---

let normalizeThrew = false;
try {
  normalizeWriteFilesInput({ files: "garbage" });
} catch {
  normalizeThrew = true;
}
check("normalizeWriteFilesInput never throws", !normalizeThrew);

const normalizeEmpty = normalizeWriteFilesInput({ files: "garbage" });
check("normalizeWriteFilesInput returns empty on failure", normalizeEmpty.files.length === 0);

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
