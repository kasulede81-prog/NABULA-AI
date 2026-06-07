import { z } from "zod";



/** Shared VFS path rules — used by REST file APIs and Builder tools. */

export const vfsPathSchema = z

  .string()

  .min(1)

  .max(500)

  .refine((p) => !p.startsWith("/"), { message: "Absolute paths are not allowed" })

  .refine((p) => !p.includes(".."), { message: "Path traversal is not allowed" })

  .refine((p) => !p.includes("\\"), { message: "Backslashes are not allowed" })

  .refine((p) => !/[\0-\x1f]/.test(p), { message: "Control characters are not allowed" })

  .refine((p) => p.trim() === p, { message: "Leading or trailing whitespace is not allowed" })

  .refine((p) => !p.endsWith("/"), { message: "Directory paths are not allowed" })

  .refine(

    (p) => p.split("/").every((seg) => seg.length > 0 && seg !== "." && seg !== ".."),

    { message: "Invalid path segment" }

  );



export const writeFileSchema = z.object({

  path: vfsPathSchema,

  content: z.string().max(1_000_000),

});



export const renameFileSchema = z.object({

  fromPath: vfsPathSchema,

  toPath: vfsPathSchema,

});



export const writeFilesSchema = z.object({

  files: z

    .array(writeFileSchema)

    .min(1, "At least one file is required")

    .max(40, "Maximum 40 files per batch"),

});



export type WriteFileInput = z.infer<typeof writeFileSchema>;

export type RenameFileInput = z.infer<typeof renameFileSchema>;

export type WriteFilesInput = z.infer<typeof writeFilesSchema>;



export interface WriteFilesParseResult {

  files: Array<{ path: string; content: string }>;

  warnings: string[];

  recovered: boolean;

}



export class WriteFilesParseError extends Error {

  constructor(message: string) {

    super(message);

    this.name = "WriteFilesParseError";

  }

}



const PATH_KEYS = ["path", "file", "name", "filepath", "file_path"] as const;

const CONTENT_KEYS = ["content", "contents", "code", "body", "text", "source"] as const;



const NESTED_PAYLOAD_KEYS = ["input", "arguments", "args", "parameters", "params", "tool_input"] as const;



/** Parse and validate write_files payloads with automatic recovery. */

export function parseWriteFilesInput(input: Record<string, unknown>): WriteFilesParseResult {

  const warnings: string[] = [];

  let recovered = false;



  const unwrapped = unwrapNestedToolPayload(input);

  if (unwrapped !== input) {

    warnings.push("Unwrapped nested tool payload");

    recovered = true;

  }



  const rawFiles = extractRawFilesValue(unwrapped);

  const { entries, parseWarnings, parseRecovered } = materializeFileEntries(rawFiles);

  warnings.push(...parseWarnings);

  if (parseRecovered) recovered = true;



  const normalized = entries

    .map((entry) => normalizeFileEntry(entry))

    .filter((f): f is { path: string; content: string } => f.path.length > 0 && f.content.length > 0);



  if (normalized.length === 0) {

    throw new WriteFilesParseError("write_files contained no valid file entries after parsing");

  }



  const parsed = writeFilesSchema.safeParse({ files: normalized });

  if (!parsed.success) {

    const message = parsed.error.errors[0]?.message ?? "Invalid write_files input";

    throw new WriteFilesParseError(message);

  }



  return { files: parsed.data.files, warnings, recovered };

}



/**

 * Safe normalization for path hints — never throws.

 * @deprecated Prefer parseWriteFilesInput for tool execution.

 */

export function normalizeWriteFilesInput(

  input: Record<string, unknown>

): { files: Array<{ path: string; content: string }> } {

  try {

    const result = parseWriteFilesInput(input);

    return { files: result.files };

  } catch {

    return { files: [] };

  }

}



function unwrapNestedToolPayload(input: Record<string, unknown>): Record<string, unknown> {

  if (hasFilesKey(input)) return input;



  for (const key of NESTED_PAYLOAD_KEYS) {

    const nested = input[key];

    if (nested && typeof nested === "object" && !Array.isArray(nested)) {

      const obj = nested as Record<string, unknown>;

      if (hasFilesKey(obj) || hasTopLevelFileFields(obj)) {

        return unwrapNestedToolPayload(obj);

      }

    }

  }



  return input;

}



function hasFilesKey(obj: Record<string, unknown>): boolean {

  return obj.files !== undefined && obj.files !== null;

}



function hasTopLevelFileFields(obj: Record<string, unknown>): boolean {

  return PATH_KEYS.some((k) => typeof obj[k] === "string");

}



function extractRawFilesValue(input: Record<string, unknown>): unknown {

  if (hasFilesKey(input)) return input.files;



  if (hasTopLevelFileFields(input)) {

    return [input];

  }



  return undefined;

}



function materializeFileEntries(raw: unknown): {

  entries: unknown[];

  parseWarnings: string[];

  parseRecovered: boolean;

} {

  const parseWarnings: string[] = [];

  let parseRecovered = false;



  if (raw === undefined || raw === null) {

    return { entries: [], parseWarnings, parseRecovered };

  }



  if (typeof raw === "string") {

    const fromString = parseFilesJsonString(raw);

    parseWarnings.push(...fromString.warnings);

    if (fromString.recovered) parseRecovered = true;

    return { entries: fromString.entries, parseWarnings, parseRecovered };

  }



  if (Array.isArray(raw)) {

    return { entries: raw, parseWarnings, parseRecovered };

  }



  if (typeof raw === "object") {

    const obj = raw as Record<string, unknown>;

    if (looksLikeFileObject(obj)) {

      return { entries: [obj], parseWarnings, parseRecovered };

    }

    return { entries: Object.values(obj), parseWarnings, parseRecovered };

  }



  return { entries: [], parseWarnings, parseRecovered };

}



function parseFilesJsonString(raw: string): {

  entries: unknown[];

  warnings: string[];

  recovered: boolean;

} {

  const warnings: string[] = [];

  let decoded: unknown = raw.trim();



  for (let depth = 0; depth < 3 && typeof decoded === "string"; depth++) {

    try {

      decoded = JSON.parse(decoded);

    } catch {

      break;

    }

    if (depth > 0) warnings.push("Decoded nested JSON string in files payload");

  }



  if (Array.isArray(decoded)) {

    return { entries: decoded, warnings, recovered: warnings.length > 0 };

  }



  if (decoded && typeof decoded === "object") {

    const obj = decoded as Record<string, unknown>;

    if (looksLikeFileObject(obj)) {

      return { entries: [obj], warnings, recovered: warnings.length > 0 };

    }

    return { entries: Object.values(obj), warnings, recovered: warnings.length > 0 };

  }



  const recovered = recoverFilesFromMalformedJsonString(raw);

  if (recovered.length > 0) {

    warnings.push("Recovered files from malformed JSON string (unquoted content)");

    return { entries: recovered, warnings, recovered: true };

  }



  return { entries: [], warnings, recovered: false };

}



function looksLikeFileObject(obj: Record<string, unknown>): boolean {

  return PATH_KEYS.some((k) => typeof obj[k] === "string");

}



function normalizeFileEntry(raw: unknown): { path: string; content: string } {

  if (!raw || typeof raw !== "object") {

    return { path: "", content: "" };

  }



  const item = raw as Record<string, unknown>;

  const path = PATH_KEYS.map((k) => item[k]).find((v) => typeof v === "string") as string | undefined;



  let rawContent: unknown;

  for (const key of CONTENT_KEYS) {

    if (item[key] !== undefined) {

      rawContent = item[key];

      break;

    }

  }



  let content = "";

  if (typeof rawContent === "string") {

    content = decodeEscapedContent(rawContent);

  } else if (rawContent != null) {

    content = JSON.stringify(rawContent);

  }



  return { path: path ?? "", content };

}



function decodeEscapedContent(content: string): string {

  if (!content.includes("\\n") && !content.includes('\\"')) {

    return content;

  }

  try {

    return JSON.parse(`"${content.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);

  } catch {

    return content

      .replace(/\\n/g, "\n")

      .replace(/\\t/g, "\t")

      .replace(/\\"/g, '"')

      .replace(/\\\\/g, "\\");

  }

}



/** Recover file entries when JSON.parse fails due to unquoted TypeScript/JSX content. */

export function recoverFilesFromMalformedJsonString(

  raw: string

): Array<{ path: string; content: string }> {

  const results: Array<{ path: string; content: string }> = [];

  const pathPattern = /"path"\s*:\s*"((?:\\.|[^"\\])*)"/g;

  const pathMatches: Array<{ path: string; index: number; length: number }> = [];



  let match: RegExpExecArray | null;

  while ((match = pathPattern.exec(raw)) !== null) {

    pathMatches.push({

      path: unescapeJsonString(match[1] ?? ""),

      index: match.index,

      length: match[0].length,

    });

  }



  if (pathMatches.length === 0) return results;



  for (let i = 0; i < pathMatches.length; i++) {

    const current = pathMatches[i]!;

    const next = pathMatches[i + 1];

    const blockEnd = next ? next.index : raw.length;

    const block = raw.slice(current.index, blockEnd);



    const content = extractContentFromBlock(block);

    if (content !== null && content.length > 0) {

      results.push({ path: current.path, content });

    }

  }



  return results;

}



function extractContentFromBlock(block: string): string | null {

  const marker = /"content"\s*:\s*/;

  const markerMatch = marker.exec(block);

  if (!markerMatch) return null;



  const after = block.slice(markerMatch.index + markerMatch[0].length);



  if (after.startsWith('"')) {

    const quoted = parseQuotedJsonString(after);

    return quoted ?? null;

  }



  if (after.startsWith("{") || after.startsWith("[")) {

    try {

      const end = findJsonValueEnd(after);

      const slice = after.slice(0, end);

      return JSON.stringify(JSON.parse(slice));

    } catch {

      /* fall through to raw extraction */

    }

  }



  const terminators = [/\n\s*\}\s*,?/, /\n\s*\}/, /,\s*\{\s*"path"/, /\}\s*\]/];

  let end = after.length;

  for (const pattern of terminators) {

    const hit = pattern.exec(after);

    if (hit && hit.index > 0 && hit.index < end) {

      end = hit.index;

    }

  }



  return after.slice(0, end).trim();

}



function parseQuotedJsonString(input: string): string | null {

  let i = 1;

  let out = "";

  while (i < input.length) {

    const ch = input[i]!;

    if (ch === "\\") {

      const next = input[i + 1];

      if (next === "n") {

        out += "\n";

        i += 2;

        continue;

      }

      if (next === "t") {

        out += "\t";

        i += 2;

        continue;

      }

      if (next === '"') {

        out += '"';

        i += 2;

        continue;

      }

      if (next === "\\") {

        out += "\\";

        i += 2;

        continue;

      }

      out += next ?? "";

      i += 2;

      continue;

    }

    if (ch === '"') {

      return out;

    }

    out += ch;

    i++;

  }

  return null;

}



function findJsonValueEnd(input: string): number {

  let depth = 0;

  let inString = false;

  let escaped = false;



  for (let i = 0; i < input.length; i++) {

    const ch = input[i]!;

    if (inString) {

      if (escaped) {

        escaped = false;

        continue;

      }

      if (ch === "\\") {

        escaped = true;

        continue;

      }

      if (ch === '"') inString = false;

      continue;

    }



    if (ch === '"') {

      inString = true;

      continue;

    }

    if (ch === "{" || ch === "[") depth++;

    if (ch === "}" || ch === "]") {

      depth--;

      if (depth === 0) return i + 1;

    }

  }



  return input.length;

}



function unescapeJsonString(value: string): string {

  return value.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");

}



/** Strip characters that break WIN1252 PostgreSQL clients on Windows. */

export function sanitizeFileContent(content: string): string {

  return sanitizePersistedText(content);

}



/** Sanitize any text before PostgreSQL persistence (files, messages, errors). */

export function sanitizePersistedText(content: string): string {

  return content

    .replace(/[\u2500-\u257F]/g, "-") // box drawing

    .replace(/[\u2580-\u259F]/g, "") // block elements

    .replace(/[\u2190-\u21FF]/g, "->") // arrows (→ etc.)

    .replace(/\u25B2/g, "*"); // triangles (▲) used in some LLM outputs

}



/** Validate a VFS path. Returns parsed path or error message. */

export function validateVfsPath(path: unknown): { ok: true; path: string } | { ok: false; message: string } {

  const parsed = vfsPathSchema.safeParse(path);

  if (parsed.success) {

    return { ok: true, path: parsed.data };

  }

  const message = parsed.error.errors[0]?.message ?? "Invalid file path";

  return { ok: false, message };

}


