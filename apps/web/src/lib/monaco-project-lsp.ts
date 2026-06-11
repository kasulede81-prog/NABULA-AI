import type { Monaco } from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { api } from "@/lib/api";

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|d\.ts)$/;
const MAX_PROJECT_FILES = 300;

// Errors caused by missing node_modules type definitions in the browser —
// suppress these so real type errors stand out (web-IDE standard practice).
const IGNORED_DIAGNOSTICS = [
  2307, // Cannot find module
  2792, // Cannot find module (suggest moduleResolution)
  7016, // Could not find declaration file
  2580, // Cannot find name 'require'
  2584, // Cannot find name 'console' (missing lib dom edge cases)
  1259, // Module can only be default-imported with esModuleInterop
];

export function fileUri(monaco: Monaco, path: string): MonacoEditor.Uri {
  return monaco.Uri.parse(`file:///${path}`);
}

/**
 * Cursor-style project intelligence for Monaco:
 * - Loads every code file in the project as a model so the built-in
 *   TypeScript worker resolves imports across files.
 * - Enables live type errors (with node_modules noise suppressed).
 * - Routes cross-file go-to-definition into the workspace tab system.
 */
export async function setupProjectIntelligence(
  monaco: Monaco,
  projectId: string,
  onOpenFile: (path: string, line?: number, column?: number) => void
): Promise<() => void> {
  const ts = monaco.languages.typescript;

  const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    strict: false,
    noEmit: true,
    baseUrl: "file:///",
    paths: {
      "@/*": ["src/*", "app/*", "*"],
    },
  };
  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);

  const diagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: IGNORED_DIAGNOSTICS,
  };
  ts.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  ts.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  ts.typescriptDefaults.setEagerModelSync(true);
  ts.javascriptDefaults.setEagerModelSync(true);

  const createdModels: MonacoEditor.editor.ITextModel[] = [];

  try {
    const list = await api.listFiles(projectId);
    const codePaths = list.data
      .map((f) => f.path)
      .filter((p) => CODE_EXTENSIONS.test(p))
      .slice(0, MAX_PROJECT_FILES);

    // Read in small batches to avoid hammering the API.
    const BATCH = 12;
    for (let i = 0; i < codePaths.length; i += BATCH) {
      const batch = codePaths.slice(i, i + BATCH);
      const files = await Promise.all(
        batch.map(async (path) => {
          try {
            const file = await api.readFile(projectId, path);
            return { path, content: file.content };
          } catch {
            return null;
          }
        })
      );
      for (const file of files) {
        if (!file) continue;
        const uri = fileUri(monaco, file.path);
        if (monaco.editor.getModel(uri)) continue;
        const model = monaco.editor.createModel(
          file.content,
          undefined,
          uri
        );
        createdModels.push(model);
      }
    }
  } catch {
    /* project intelligence is best-effort */
  }

  // Cross-file go-to-definition: open the target file in our tab system.
  const opener = monaco.editor.registerEditorOpener({
    openCodeEditor: (
      _source: MonacoEditor.editor.ICodeEditor,
      resource: MonacoEditor.Uri,
      selectionOrPosition?: MonacoEditor.IRange | MonacoEditor.IPosition
    ) => {
      const path = resource.path.replace(/^\//, "");
      if (!path) return false;
      let line: number | undefined;
      let column: number | undefined;
      if (selectionOrPosition) {
        if ("startLineNumber" in selectionOrPosition) {
          line = selectionOrPosition.startLineNumber;
          column = selectionOrPosition.startColumn;
        } else if ("lineNumber" in selectionOrPosition) {
          line = selectionOrPosition.lineNumber;
          column = selectionOrPosition.column;
        }
      }
      onOpenFile(path, line, column);
      return true;
    },
  });

  return () => {
    opener.dispose();
    for (const model of createdModels) {
      if (!model.isDisposed()) model.dispose();
    }
  };
}

/** Keep a background model in sync after saves/agent writes. */
export function syncProjectModel(
  monaco: Monaco,
  path: string,
  content: string
) {
  const model = monaco.editor.getModel(fileUri(monaco, path));
  if (model && !model.isDisposed() && model.getValue() !== content) {
    model.setValue(content);
  }
}
