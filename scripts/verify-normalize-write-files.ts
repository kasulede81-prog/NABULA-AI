/**
 * Verifies normalizeWriteFilesInput safe wrapper (non-throwing path hints).
 */
import { normalizeWriteFilesInput, parseWriteFilesInput } from "@nebula/shared";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function safeExtractPaths(input: Record<string, unknown>): string {
  const { files } = normalizeWriteFilesInput(input);
  return files.map((f) => f.path).join(", ");
}

console.log("Normalize write_files Verification\n");

// Array payload
const arrayResult = normalizeWriteFilesInput({
  files: [{ path: "src/app/page.tsx", content: "export default function Page() {}" }],
});
assert(arrayResult.files.length === 1, "array payload should parse one file");
assert(arrayResult.files[0]?.path === "src/app/page.tsx", "array path preserved");
console.log("[PASS] Array payload");

// Object map payload (LLM sometimes returns keyed object)
const objectResult = normalizeWriteFilesInput({
  files: {
    "0": { path: "prisma/schema.prisma", content: "model User { id Int @id }" },
    "1": { path: "src/lib/db.ts", content: "export const db = {}" },
  },
});
assert(objectResult.files.length === 2, "object payload should parse two files");
console.log("[PASS] Object map payload");

// Single file object (LLM sometimes omits array wrapper)
const singleObjectResult = normalizeWriteFilesInput({
  files: { path: "src/lib/utils.ts", content: "export function cn() {}" },
});
assert(singleObjectResult.files.length === 1, "single file object should parse");
assert(singleObjectResult.files[0]?.path === "src/lib/utils.ts", "single object path preserved");
console.log("[PASS] Single file object payload");

// Top-level path/content without files key
const topLevelResult = normalizeWriteFilesInput({
  path: "src/lib/prisma.ts",
  content: "export const prisma = {}",
});
assert(topLevelResult.files.length === 1, "top-level path/content should parse");
assert(topLevelResult.files[0]?.path === "src/lib/prisma.ts", "top-level path preserved");
console.log("[PASS] Top-level path/content payload");

// JSON string files array
const stringResult = normalizeWriteFilesInput({
  files: JSON.stringify([{ path: "src/lib/db.ts", content: "export {}" }]),
});
assert(stringResult.files.length === 1, "JSON string files should parse");
console.log("[PASS] JSON string files payload");

// Malformed payloads never throw
const malformedCases: Record<string, unknown>[] = [
  {},
  { files: null },
  { files: "not-an-array" },
  { files: 42 },
  { files: [{ path: "", content: "" }] },
  { files: [{ file: "src/x.ts", contents: "ok" }] },
];

for (const input of malformedCases) {
  let threw = false;
  try {
    const { files } = normalizeWriteFilesInput(input);
    files.map((f) => f.path);
    safeExtractPaths(input);
  } catch {
    threw = true;
  }
  assert(!threw, `malformed payload should not throw: ${JSON.stringify(input)}`);
}
console.log("[PASS] Malformed payloads return safely without TypeError");

// Alternate field names
const altResult = normalizeWriteFilesInput({
  files: [{ file: "src/app/layout.tsx", contents: "export default function Layout() {}" }],
});
assert(altResult.files.length === 1, "alternate field names should normalize");
assert(altResult.files[0]?.path === "src/app/layout.tsx", "file alias mapped to path");
console.log("[PASS] Alternate field name aliases");

// parseWriteFilesInput throws on unrecoverable garbage
let parseThrew = false;
try {
  parseWriteFilesInput({ files: "not json at all {{{" });
} catch {
  parseThrew = true;
}
assert(parseThrew, "parseWriteFilesInput throws on unrecoverable payload");
console.log("[PASS] parseWriteFilesInput throws on unrecoverable payload");

console.log("\n--- all checks passed ---");
