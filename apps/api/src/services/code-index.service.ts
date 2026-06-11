import { prisma } from "../lib/prisma";

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "export"
  | "variable";

export interface CodeSymbol {
  path: string;
  kind: SymbolKind;
  name: string;
  line: number;
  column: number;
}

const INDEXABLE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;

const SYMBOL_PATTERNS: Array<{
  kind: SymbolKind;
  re: RegExp;
}> = [
  {
    kind: "export",
    re: /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
  },
  {
    kind: "function",
    re: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
  },
  {
    kind: "class",
    re: /^\s*class\s+([A-Za-z_$][\w$]*)/gm,
  },
  {
    kind: "interface",
    re: /^\s*interface\s+([A-Za-z_$][\w$]*)/gm,
  },
  {
    kind: "type",
    re: /^\s*type\s+([A-Za-z_$][\w$]*)\s*=/gm,
  },
  {
    kind: "variable",
    re: /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm,
  },
];

export function extractSymbols(path: string, content: string): CodeSymbol[] {
  if (!INDEXABLE_EXT.test(path)) return [];

  const lines = content.split("\n");
  const found = new Map<string, CodeSymbol>();

  for (const { kind, re } of SYMBOL_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const name = match[1];
      if (!name || name.length < 2) continue;
      const before = content.slice(0, match.index);
      const line = before.split("\n").length;
      const lineStart = before.lastIndexOf("\n") + 1;
      const column = match.index - lineStart;
      const key = `${kind}:${name}:${line}`;
      if (!found.has(key)) {
        found.set(key, { path, kind, name, line, column });
      }
    }
  }

  return [...found.values()].sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
}

export class CodeIndexService {
  async indexFile(projectId: string, path: string, content: string) {
    if (!INDEXABLE_EXT.test(path)) {
      await prisma.codeIndexEntry.deleteMany({ where: { projectId, path } });
      return [];
    }

    const symbols = extractSymbols(path, content);
    await prisma.$transaction([
      prisma.codeIndexEntry.deleteMany({ where: { projectId, path } }),
      ...(symbols.length > 0
        ? [
            prisma.codeIndexEntry.createMany({
              data: symbols.map((s) => ({
                projectId,
                path: s.path,
                kind: s.kind,
                name: s.name,
                line: s.line,
                column: s.column,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    return symbols;
  }

  async removeFile(projectId: string, path: string) {
    await prisma.codeIndexEntry.deleteMany({ where: { projectId, path } });
  }

  scheduleIndexFile(projectId: string, path: string, content: string) {
    setImmediate(() => {
      this.indexFile(projectId, path, content).catch((err) => {
        console.error(`[code-index] Failed for ${projectId}/${path}:`, err);
      });
    });
  }

  async searchSymbols(projectId: string, query: string, limit = 40): Promise<CodeSymbol[]> {
    const q = query.trim();
    if (!q) return [];

    const rows = await prisma.codeIndexEntry.findMany({
      where: {
        projectId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { path: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ name: "asc" }, { path: "asc" }],
      take: limit,
    });

    return rows.map((r) => ({
      path: r.path,
      kind: r.kind as SymbolKind,
      name: r.name,
      line: r.line,
      column: r.column,
    }));
  }

  async listSymbols(projectId: string, limit = 500): Promise<CodeSymbol[]> {
    const rows = await prisma.codeIndexEntry.findMany({
      where: { projectId },
      orderBy: [{ path: "asc" }, { line: "asc" }],
      take: limit,
    });
    return rows.map((r) => ({
      path: r.path,
      kind: r.kind as SymbolKind,
      name: r.name,
      line: r.line,
      column: r.column,
    }));
  }
}

export const codeIndexService = new CodeIndexService();
