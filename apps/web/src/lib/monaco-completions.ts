import type { Monaco } from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";

export interface CodeSymbol {
  path: string;
  kind: string;
  name: string;
  line: number;
  column: number;
}

export function registerProjectCompletions(
  monaco: Monaco,
  symbols: CodeSymbol[],
  filePaths: string[]
) {
  const languages = [
    "typescript",
    "javascript",
    "typescriptreact",
    "javascriptreact",
  ];

  const disposeFns = languages.map((languageId) =>
    monaco.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: [".", "/", "@", '"', "'"],
      provideCompletionItems: (
        model: MonacoEditor.editor.ITextModel,
        position: MonacoEditor.Position
      ) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const prefix = word.word.toLowerCase();
        const currentPath = model.uri.path.replace(/^\//, "");
        const lineContent = model.getLineContent(position.lineNumber);

        const pathSuggestions = filePaths
          .filter((p) => p !== currentPath)
          .filter((p) => !prefix || p.toLowerCase().includes(prefix))
          .slice(0, 20)
          .map((p) => ({
            label: p,
            kind: monaco.languages.CompletionItemKind.File,
            insertText: p,
            range,
            detail: "project file",
          }));

        const currentSymbols = symbols
          .filter((s) => s.path === currentPath)
          .filter(
            (s) => !prefix || s.name.toLowerCase().startsWith(prefix)
          )
          .slice(0, 20)
          .map((s) => ({
            label: s.name,
            kind:
              s.kind === "class"
                ? monaco.languages.CompletionItemKind.Class
                : s.kind === "interface"
                  ? monaco.languages.CompletionItemKind.Interface
                  : s.kind === "function"
                    ? monaco.languages.CompletionItemKind.Function
                    : monaco.languages.CompletionItemKind.Variable,
            insertText: s.name,
            range,
            detail: `${s.kind} · line ${s.line}`,
          }));

        const crossFileSymbols = symbols
          .filter((s) => s.path !== currentPath)
          .filter(
            (s) => !prefix || s.name.toLowerCase().startsWith(prefix)
          )
          .slice(0, 15)
          .map((s) => ({
            label: s.name,
            kind: monaco.languages.CompletionItemKind.Reference,
            insertText: s.name,
            range,
            detail: `${s.kind} · ${s.path}:${s.line}`,
          }));

        const importSuggestions: MonacoEditor.languages.CompletionItem[] = [];
        if (
          lineContent.trimStart().startsWith("import") ||
          lineContent.includes("from ")
        ) {
          for (const p of filePaths.slice(0, 30)) {
            if (p === currentPath) continue;
            const withoutExt = p.replace(/\.(tsx?|jsx?)$/, "");
            if (prefix && !withoutExt.toLowerCase().includes(prefix)) continue;
            importSuggestions.push({
              label: withoutExt,
              kind: monaco.languages.CompletionItemKind.Module,
              insertText: withoutExt.startsWith("@/")
                ? withoutExt
                : `./${withoutExt}`,
              range,
              detail: "import path",
            });
          }
        }

        return {
          suggestions: [
            ...currentSymbols,
            ...crossFileSymbols,
            ...importSuggestions,
            ...pathSuggestions,
          ],
        };
      },
    })
  );

  return () => disposeFns.forEach((d) => d.dispose());
}
