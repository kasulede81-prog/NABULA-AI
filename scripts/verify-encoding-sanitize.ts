/**
 * Verifies box-drawing characters are stripped before PostgreSQL persistence.
 */
import { sanitizeFileContent, sanitizePersistedText } from "@nebula/shared";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

console.log("Encoding Sanitize Verification\n");

const boxDrawing = "┌─────────┐\n│ schema  │\n└─────────┘";
const sanitized = sanitizeFileContent(boxDrawing);

assert(!/[\u2500-\u257F]/.test(sanitized), "box-drawing chars should be removed/replaced");
assert(sanitized.includes("-"), "box drawing replaced with ASCII hyphen");
console.log("[PASS] Box-drawing characters stripped");

const blockChars = "█▀▄";
const sanitizedBlocks = sanitizeFileContent(blockChars);
assert(!/[\u2580-\u259F]/.test(sanitizedBlocks), "block elements should be removed");
console.log("[PASS] Block elements stripped");

const ascii = "model User {\n  id Int @id\n}";
assert(sanitizeFileContent(ascii) === ascii, "ASCII content unchanged");
console.log("[PASS] ASCII content preserved");

// Byte sequence from PostgresError 22P05 (U+2500 BOX DRAWINGS LIGHT HORIZONTAL)
const problematic = "\u2500\u2500\u2500";
const fixed = sanitizeFileContent(problematic);
assert(!Buffer.from(fixed, "utf8").includes(0xe2), "no multi-byte box chars remain");
console.log("[PASS] 22P05 byte sequence eliminated");

const arrows = "Step 1 → Step 2 ← back";
const sanitizedArrows = sanitizePersistedText(arrows);
assert(!/[\u2190-\u21FF]/.test(sanitizedArrows), "arrow chars should be replaced");
console.log("[PASS] Arrow characters sanitized");

console.log("\n--- 5/5 checks passed ---");
