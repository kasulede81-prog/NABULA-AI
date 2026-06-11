import type { Monaco } from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { api } from "@/lib/api";

const DEBOUNCE_MS = 350;
const LANGUAGES = [
  "typescript",
  "javascript",
  "typescriptreact",
  "javascriptreact",
  "json",
  "css",
  "html",
  "markdown",
  "python",
];

/**
 * Cursor-Tab-style AI ghost-text completions.
 * Registers a Monaco inline completions provider that asks the API
 * (LLM-backed, env-gated) for code to insert at the cursor.
 */
export function registerAiTabCompletions(
  monaco: Monaco,
  projectId: string,
  getActivePath: () => string | null,
  getRecentEdits?: () => string
): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastResult: { key: string; completion: string } | null = null;
  let disabled = false;

  const provider: MonacoEditor.languages.InlineCompletionsProvider = {
    provideInlineCompletions: async (model, position, _context, token) => {
      if (disabled) return { items: [] };
      const path = getActivePath();
      if (!path) return { items: [] };

      const prefix = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const suffix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: model.getLineCount(),
        endColumn: model.getLineMaxColumn(model.getLineCount()),
      });

      // Skip empty buffers and mid-word triggers with nothing typed.
      if (prefix.trim().length < 10) return { items: [] };

      const key = `${path}:${position.lineNumber}:${position.column}:${prefix.slice(-80)}`;
      if (lastResult?.key === key) {
        return toItems(lastResult.completion, position);
      }

      // Debounce: wait for typing to pause before hitting the API.
      const completion = await new Promise<string>((resolve) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) return resolve("");
          try {
            const res = await api.tabCompletion(projectId, {
              path,
              prefix,
              suffix,
              language: model.getLanguageId(),
              recentEdits: getRecentEdits?.(),
            });
            resolve(res.data.completion ?? "");
          } catch {
            // Feature not configured server-side; stop asking this session.
            disabled = true;
            resolve("");
          }
        }, DEBOUNCE_MS);
      });

      if (!completion || token.isCancellationRequested) return { items: [] };
      lastResult = { key, completion };
      return toItems(completion, position);
    },
    disposeInlineCompletions: () => {},
  };

  const disposables = LANGUAGES.map((lang) =>
    monaco.languages.registerInlineCompletionsProvider(lang, provider)
  );

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const d of disposables) d.dispose();
  };
}

function toItems(
  completion: string,
  position: MonacoEditor.Position
): MonacoEditor.languages.InlineCompletions {
  return {
    items: [
      {
        insertText: completion,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
      },
    ],
  };
}
