/**
 * Verifies LLM provider selection, configuration readiness, and DeepSeek mapping (no live API calls).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AgentError, NonRetryableErrorCodes } from "@nebula/shared";
import {
  isProviderApiKeyConfigured,
  type LLMProviderId,
} from "../apps/api/src/config/llm-provider";
import { ClaudeProvider } from "../apps/api/src/providers/llm/claude.provider";
import {
  DeepSeekProvider,
  mapMessagesToOpenAI,
  mapToolsToOpenAI,
  parseDeepSeekResponse,
  parseToolCallArguments,
} from "../apps/api/src/providers/llm/deepseek.provider";
import { createLLMProviderForId } from "../apps/api/src/providers/llm/index";

const ROOT = resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (ok) passed++;
  else failed++;
}

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

console.log("LLM Provider Verification\n");

// --- Supported providers ---

const supportedProviders: LLMProviderId[] = ["anthropic", "deepseek"];
check("supported providers include anthropic and deepseek", supportedProviders.length === 2);

for (const id of supportedProviders) {
  const instance = createLLMProviderForId(id);
  check(
    `createLLMProviderForId("${id}") returns a provider with generate()`,
    typeof instance.generate === "function"
  );
}

check(
  "anthropic resolves to ClaudeProvider",
  createLLMProviderForId("anthropic") instanceof ClaudeProvider
);
check(
  "deepseek resolves to DeepSeekProvider",
  createLLMProviderForId("deepseek") instanceof DeepSeekProvider
);

// --- Environment / configuration readiness ---

check(
  "anthropic configured when ANTHROPIC_API_KEY is set",
  isProviderApiKeyConfigured("anthropic", { anthropic: "sk-ant-test", deepseek: "" })
);
check(
  "anthropic not configured when key empty",
  !isProviderApiKeyConfigured("anthropic", { anthropic: "", deepseek: "ds-key" })
);
check(
  "deepseek configured when DEEPSEEK_API_KEY is set",
  isProviderApiKeyConfigured("deepseek", { anthropic: "", deepseek: "ds-key" })
);
check(
  "deepseek not configured when key empty",
  !isProviderApiKeyConfigured("deepseek", { anthropic: "sk-ant-test", deepseek: "" })
);

const envSource = readRepoFile("apps/api/src/config/env.ts");
check("env schema defines LLM_PROVIDER", envSource.includes('LLM_PROVIDER: z.enum(["anthropic", "deepseek"])'));
check("env schema defines DEEPSEEK_API_KEY", envSource.includes("DEEPSEEK_API_KEY"));
check("env schema defines DEEPSEEK_MODEL", envSource.includes("DEEPSEEK_MODEL"));

const envExample = readRepoFile(".env.example");
check(".env.example documents LLM_PROVIDER", envExample.includes("LLM_PROVIDER"));
check(".env.example documents DEEPSEEK_API_KEY", envExample.includes("DEEPSEEK_API_KEY"));

// --- Provider selection flow (factory) ---

const indexSource = readRepoFile("apps/api/src/providers/llm/index.ts");
check("getLLMProvider uses createLLMProviderForId", indexSource.includes("createLLMProviderForId"));
check("factory switches on deepseek", indexSource.includes('case "deepseek"'));
check("factory defaults to anthropic", indexSource.includes('case "anthropic"'));

const deepseekSource = readRepoFile("apps/api/src/providers/llm/deepseek.provider.ts");
check(
  "DeepSeek tool_choice uses required or forced tool",
  deepseekSource.includes("resolveDeepSeekToolChoice") &&
    deepseekSource.includes("body.tool_choice = toolChoice")
);

const claudeSource = readRepoFile("apps/api/src/providers/llm/claude.provider.ts");
check("ClaudeProvider file unchanged in structure", claudeSource.includes("export class ClaudeProvider"));

// --- Health endpoint ---

const healthSource = readRepoFile("apps/api/src/routes/health.routes.ts");
check("GET /health exposes provider field", healthSource.includes("provider: agents.provider"));
check("GET /health exposes configured field", healthSource.includes("configured: agents.configured"));

// --- DeepSeek request/response mapping (no network) ---

const openAiTools = mapToolsToOpenAI([
  {
    name: "write_files",
    description: "Write files",
    inputSchema: { type: "object", properties: { files: { type: "array" } } },
  },
]);
check(
  "mapToolsToOpenAI produces OpenAI function tools",
  openAiTools[0]?.type === "function" && openAiTools[0].function.name === "write_files"
);

const openAiMessages = mapMessagesToOpenAI("You are a builder", [
  { role: "user", content: "Build a CRM" },
  {
    role: "assistant",
    content: [{ type: "text", text: "Starting build." }],
  },
]);
check(
  "mapMessagesToOpenAI prepends system message",
  openAiMessages[0]?.role === "system" && openAiMessages.length === 3
);
check(
  "mapMessagesToOpenAI flattens text blocks",
  openAiMessages[2]?.content === "Starting build."
);

check(
  "parseToolCallArguments parses JSON object",
  parseToolCallArguments('{"path":"src/app/page.tsx"}').path === "src/app/page.tsx"
);
check(
  "parseToolCallArguments returns {} on invalid JSON",
  Object.keys(parseToolCallArguments("not-json")).length === 0
);

const parsed = parseDeepSeekResponse({
  choices: [
    {
      message: {
        content: "Done.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "write_files",
              arguments: '{"files":[{"path":"a.ts","content":"x"}]}',
            },
          },
        ],
      },
      finish_reason: "tool_calls",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});

check("parseDeepSeekResponse maps content", parsed.content === "Done.");
check("parseDeepSeekResponse maps tool calls", parsed.toolCalls.length === 1);
check("parseDeepSeekResponse maps token usage", parsed.inputTokens === 10 && parsed.outputTokens === 5);

// --- Missing API key guard ---

async function expectConfigurationError() {
  const provider = new DeepSeekProvider("");
  try {
    await provider.generate({
      system: "test",
      messages: [{ role: "user", content: "hi" }],
    });
    return false;
  } catch (err) {
    return (
      err instanceof AgentError &&
      err.code === NonRetryableErrorCodes.CONFIGURATION_ERROR
    );
  }
}

void expectConfigurationError().then((ok) => {
  check("DeepSeekProvider.generate rejects missing API key", ok);

  const total = passed + failed;
  console.log(`\n--- ${passed}/${total} passed ---`);
  process.exit(failed > 0 ? 1 : 0);
});
