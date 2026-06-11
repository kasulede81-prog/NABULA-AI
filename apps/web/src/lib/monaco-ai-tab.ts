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
  // Resolver of the in-flight debounced request; must be settled when
  // superseded, otherwise Monaco awaits the stale promise forever.
  let pendingResolve: ((value: string) => void) | null = null;
  let lastResult: { key: string; completion: string } | null = null;
  let disabled = false;

  const cancelPending = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pendingResolve) {
      pendingResolve("");
      pendingResolve = null;
    }
  };

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
      // Settle any superseded request first so its promise never dangles.
      const completion = await new Promise<string>((resolve) => {
        cancelPending();
        pendingResolve = resolve;
        debounceTimer = setTimeout(async () => {
          debounceTimer = null;
          if (token.isCancellationRequested) {
            if (pendingResolve === resolve) pendingResolve = null;
            return resolve("");
          }
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
          } finally {
            if (pendingResolve === resolve) pendingResolve = null;
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
    cancelPending();
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
