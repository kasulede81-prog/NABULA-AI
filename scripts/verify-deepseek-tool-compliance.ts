/**
 * DeepSeek tool compliance — forced tool_choice, content recovery, diagnostics (no API calls).
 */
import {
  parseDeepSeekResponse,
  recoverToolCallsFromContent,
  resolveDeepSeekToolChoice,
  extractWriteFilesPayloadFromContent,
} from "../apps/api/src/providers/llm/deepseek.provider";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

console.log("DeepSeek Tool Compliance Verification\n");

// --- tool_choice resolution ---

check(
  'resolveDeepSeekToolChoice forces write_files',
  resolveDeepSeekToolChoice([{ name: "write_files", description: "", inputSchema: {} }], "write_files")
    ?.function?.name === "write_files"
);

check(
  'resolveDeepSeekToolChoice defaults to required',
  resolveDeepSeekToolChoice([{ name: "write_files", description: "", inputSchema: {} }]) === "required"
);

check(
  "resolveDeepSeekToolChoice undefined without tools",
  resolveDeepSeekToolChoice(undefined) === undefined
);

// --- A. Plain text only ---

const plainText = parseDeepSeekResponse(
  {
    choices: [
      {
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "I'll create src/app/page.tsx with a CRM dashboard overview.",
          tool_calls: undefined,
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  },
  { recoverFromContent: true }
);

check("A plain text: no structured tool_calls", !plainText.hadStructuredToolCalls);
check("A plain text: no recovered tool_calls", plainText.toolCalls.length === 0);
check("A plain text: finish_reason stop", plainText.stopReason === "stop");

// --- B. Content-embedded write_files JSON ---

const embeddedContent =
  'write_files\n{"files":[{"path":"src/app/page.tsx","content":"export default function Page() { return <main>CRM</main>; }"}]}';

const embedded = parseDeepSeekResponse(
  {
    choices: [
      {
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: embeddedContent,
          tool_calls: undefined,
        },
      },
    ],
  },
  { recoverFromContent: true }
);

check("B embedded: recovered from content", embedded.recoveredFromContent === true);
check("B embedded: one write_files call", embedded.toolCalls.length === 1);
check("B embedded: targets page.tsx", embedded.toolCalls[0]?.name === "write_files");
check(
  "B embedded: files array populated",
  Array.isArray(embedded.toolCalls[0]?.input.files) &&
    (embedded.toolCalls[0]?.input.files as Array<{ path: string }>)[0]?.path === "src/app/page.tsx"
);

// --- C. Double-encoded write_files JSON in content ---

const doubleEncodedContent = `write_files
{"files":"[{\\"path\\":\\"src/app/page.tsx\\",\\"content\\":\\"export default function Page() {}\\"}]"}`;

const doubleEncoded = parseDeepSeekResponse(
  {
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: doubleEncodedContent },
      },
    ],
  },
  { recoverFromContent: true }
);

check("C double-encoded: recovered", doubleEncoded.recoveredFromContent === true);
check("C double-encoded: page.tsx written", doubleEncoded.toolCalls[0]?.input.files !== undefined);

const payload = extractWriteFilesPayloadFromContent(doubleEncodedContent);
check("C double-encoded: payload extracted", payload !== null);

// --- D. OpenAI tool_calls format ---

const structured = parseDeepSeekResponse(
  {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_abc",
              type: "function",
              function: {
                name: "write_files",
                arguments: JSON.stringify({
                  files: [{ path: "package.json", content: "{}" }],
                }),
              },
            },
          ],
        },
      },
    ],
  },
  { recoverFromContent: true }
);

check("D structured: hadStructuredToolCalls", structured.hadStructuredToolCalls === true);
check("D structured: not recovered from content", !structured.recoveredFromContent);
check("D structured: finish_reason tool_calls", structured.stopReason === "tool_calls");
check("D structured: maps write_files", structured.toolCalls[0]?.name === "write_files");

// --- E. Empty tool response ---

const empty = parseDeepSeekResponse(
  {
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: "", tool_calls: undefined },
      },
    ],
  },
  { recoverFromContent: true }
);

check("E empty: no tool calls", empty.toolCalls.length === 0);
check("E empty: no recovery flag", !empty.recoveredFromContent);
check("E empty: no structured calls", !empty.hadStructuredToolCalls);

// --- recoverToolCallsFromContent direct ---

const direct = recoverToolCallsFromContent(embeddedContent);
check("recoverToolCallsFromContent returns write_files", direct[0]?.name === "write_files");

const noRecover = recoverToolCallsFromContent("Thanks, build complete.");
check("recoverToolCallsFromContent skips plain text", noRecover.length === 0);

console.log(`\n--- ${passed}/${passed + failed} passed ---`);
process.exit(failed > 0 ? 1 : 0);
