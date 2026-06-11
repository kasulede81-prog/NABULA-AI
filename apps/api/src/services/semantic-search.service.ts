import { prisma } from "../lib/prisma";
import { resolveLLMProvider } from "../providers/llm";
import { projectService } from "./project.service";
import { vfsService } from "./vfs.service";
import { codeIndexService } from "./code-index.service";

export interface SemanticSearchHit {
  path: string;
  score: number;
  reason: string;
  snippet: string;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/)
      .filter((t) => t.length > 2)
  );
}

function overlapScore(query: Set<string>, text: string): number {
  const tokens = tokenize(text);
  let score = 0;
  for (const q of query) {
    if (tokens.has(q)) score += 2;
    else if (text.toLowerCase().includes(q)) score += 1;
  }
  return score;
}

export class SemanticSearchService {
  async search(
    projectId: string,
    userId: string,
    query: string,
    limit = 10
  ): Promise<SemanticSearchHit[]> {
    await projectService.get(projectId, userId);
    const q = query.trim();
    if (!q) return [];

    const files = await prisma.file.findMany({
      where: { projectId },
      select: { path: true, content: true },
      take: 200,
    });

    const queryTokens = tokenize(q);
    const ranked = files
      .map((f) => {
        const symbolBoost = f.content
          .split("\n")
          .filter((line) =>
            [...queryTokens].some((t) => line.toLowerCase().includes(t))
          ).length;
        const score =
          overlapScore(queryTokens, f.path) * 3 +
          overlapScore(queryTokens, f.content.slice(0, 4000)) +
          Math.min(symbolBoost, 10);
        const snippet =
          f.content
            .split("\n")
            .find((line) =>
              [...queryTokens].some((t) => line.toLowerCase().includes(t))
            )
            ?.trim()
            .slice(0, 120) ?? f.path;
        return { path: f.path, score, reason: "content match", snippet };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked.length >= limit) {
      return ranked.slice(0, limit);
    }

    const llmHits = await this.llmRank(projectId, q, files, limit);
    const merged = new Map<string, SemanticSearchHit>();
    for (const hit of [...ranked, ...llmHits]) {
      const prev = merged.get(hit.path);
      if (!prev || hit.score > prev.score) merged.set(hit.path, hit);
    }

    const symbols = await codeIndexService.searchSymbols(projectId, q, 8);
    for (const s of symbols) {
      const existing = merged.get(s.path);
      if (!existing) {
        merged.set(s.path, {
          path: s.path,
          score: 5,
          reason: `${s.kind} ${s.name}`,
          snippet: `${s.name} at line ${s.line}`,
        });
      }
    }

    return [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async llmRank(
    projectId: string,
    query: string,
    files: Array<{ path: string; content: string }>,
    limit: number
  ): Promise<SemanticSearchHit[]> {
    if (files.length === 0) return [];

    const catalog = files
      .slice(0, 80)
      .map((f) => {
        const preview = f.content.replace(/\s+/g, " ").slice(0, 120);
        return `${f.path}: ${preview}`;
      })
      .join("\n");

    try {
      const llm = resolveLLMProvider();
      const result = await llm.generate({
        system:
          "You rank project files by relevance to a search query. Return ONLY a JSON array of objects: [{\"path\":\"...\",\"reason\":\"...\"}]. Max 8 items. No markdown.",
        messages: [
          {
            role: "user",
            content: `Query: ${query}\n\nFiles:\n${catalog}`,
          },
        ],
        maxTokens: 800,
        temperature: 0,
      });

      const parsed = JSON.parse(
        result.content.replace(/```json|```/g, "").trim()
      ) as Array<{ path?: string; reason?: string }>;

      const hits: SemanticSearchHit[] = [];
      for (const [idx, row] of parsed.entries()) {
        if (!row.path) continue;
        const file = files.find((f) => f.path === row.path);
        if (!file) continue;
        hits.push({
          path: row.path,
          score: 20 - idx,
          reason: row.reason ?? "LLM ranked",
          snippet: file.content.replace(/\s+/g, " ").slice(0, 120),
        });
      }
      return hits.slice(0, limit);
    } catch {
      return [];
    }
  }

  async searchForContext(
    projectId: string,
    userId: string,
    query: string,
    maxFiles = 5
  ) {
    const hits = await this.search(projectId, userId, query, maxFiles);
    const sections: string[] = [];
    for (const hit of hits) {
      try {
        const file = await vfsService.readFile(projectId, userId, hit.path);
        const snippet =
          file.content.length > 4000
            ? `${file.content.slice(0, 4000)}\n…`
            : file.content;
        sections.push(
          `--- ${hit.path} (semantic: ${hit.reason}) ---\n${snippet}`
        );
      } catch {
        /* skip */
      }
    }
    return sections;
  }
}

export const semanticSearchService = new SemanticSearchService();
