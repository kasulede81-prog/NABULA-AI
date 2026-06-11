import { prisma } from "../lib/prisma";
import { vfsService } from "./vfs.service";
import { codeIndexService } from "./code-index.service";
import { semanticSearchService } from "./semantic-search.service";
import { webSearchService } from "./web-search.service";

const MENTION_RE = /@([^\s@]+)/g;
const CODEBASE_RE = /@codebase(?::|\s+)([^\n@]+)?/gi;
const FOLDER_RE = /@folder:([^\s@]+)/gi;
const DOCS_RE = /@docs:(https?:\/\/[^\s@]+)/gi;

export function extractMentionPaths(content: string): string[] {
  const paths = new Set<string>();
  for (const match of content.matchAll(MENTION_RE)) {
    const path = match[1]?.trim();
    if (
      !path ||
      path === "codebase" ||
      path === "web" ||
      path.startsWith("web:") ||
      path.startsWith("folder:") ||
      path.startsWith("docs:")
    ) {
      continue;
    }
    if (path.includes("/") || path.includes(".")) {
      paths.add(path);
    }
  }
  for (const match of content.matchAll(FOLDER_RE)) {
    const folder = match[1]?.trim().replace(/\/$/, "");
    if (folder) paths.add(`${folder}/`);
  }
  return [...paths];
}

function extractCodebaseQuery(content: string): string | null {
  const m = /@codebase(?::|\s+)([^\n@]+)/i.exec(content);
  if (m?.[1]?.trim()) return m[1].trim();
  if (/@codebase\b/i.test(content)) return "";
  return null;
}

function extractWebQuery(content: string): string | null {
  const m = /@web(?::|\s+)([^\n@]+)/i.exec(content);
  if (m?.[1]?.trim()) return m[1].trim();
  if (/@web\b/i.test(content)) {
    return content
      .replace(/@web\b:?/gi, "")
      .replace(MENTION_RE, "")
      .trim();
  }
  return null;
}

function extractDocsUrls(content: string): string[] {
  const urls = new Set<string>();
  for (const match of content.matchAll(DOCS_RE)) {
    if (match[1]) urls.add(match[1]);
  }
  return [...urls];
}

function extractFolderPrefixes(content: string): string[] {
  const prefixes = new Set<string>();
  for (const match of content.matchAll(FOLDER_RE)) {
    const p = match[1]?.trim().replace(/\/$/, "");
    if (p) prefixes.add(p);
  }
  for (const match of content.matchAll(MENTION_RE)) {
    const path = match[1]?.trim();
    if (path?.endsWith("/")) {
      prefixes.add(path.replace(/\/$/, ""));
    }
  }
  return [...prefixes];
}

export async function buildMessageContext(
  projectId: string,
  userId: string,
  content: string,
  attachedFiles?: string[]
): Promise<{ displayContent: string; agentContent: string }> {
  const sections: string[] = [];

  const filePaths = [
    ...new Set([...(attachedFiles ?? []), ...extractMentionPaths(content)]),
  ].filter((p) => !p.endsWith("/"));

  for (const path of filePaths.slice(0, 20)) {
    try {
      const file = await vfsService.readFile(projectId, userId, path);
      const snippet =
        file.content.length > 12_000
          ? `${file.content.slice(0, 12_000)}\n… (truncated)`
          : file.content;
      sections.push(`--- ${path} ---\n${snippet}`);
    } catch {
      /* skip */
    }
  }

  const folderPrefixes = extractFolderPrefixes(content);
  if (folderPrefixes.length > 0) {
    const tree = await vfsService.listTree(projectId, userId);
    for (const prefix of folderPrefixes.slice(0, 5)) {
      const folderFiles = tree
        .filter(
          (f) => f.path === prefix || f.path.startsWith(`${prefix}/`)
        )
        .slice(0, 12);
      for (const node of folderFiles) {
        if (sections.length >= 25) break;
        try {
          const file = await vfsService.readFile(projectId, userId, node.path);
          const snippet =
            file.content.length > 6_000
              ? `${file.content.slice(0, 6_000)}\n… (truncated)`
              : file.content;
          sections.push(`--- ${node.path} (folder @${prefix}) ---\n${snippet}`);
        } catch {
          /* skip */
        }
      }
    }
  }

  const codebaseQuery = extractCodebaseQuery(content);
  if (codebaseQuery !== null) {
    const q = codebaseQuery || content.replace(/@codebase/gi, "").trim();
    const [symbols, searchHits, semanticSections] = await Promise.all([
      codeIndexService.searchSymbols(projectId, q.slice(0, 80) || "export", 15),
      q
        ? vfsService.searchFiles(projectId, userId, q, 10)
        : Promise.resolve([]),
      q
        ? semanticSearchService.searchForContext(projectId, userId, q, 5)
        : Promise.resolve([]),
    ]);

    if (semanticSections.length > 0) {
      sections.push(...semanticSections);
    }

    if (symbols.length > 0) {
      sections.push(
        `[Codebase symbols]\n${symbols
          .map((s) => `${s.kind} ${s.name} — ${s.path}:${s.line}`)
          .join("\n")}`
      );
    }

    for (const hit of searchHits.slice(0, 5)) {
      if (hit.kind === "file" && !sections.some((s) => s.includes(hit.path))) {
        try {
          const file = await vfsService.readFile(projectId, userId, hit.path);
          const snippet =
            file.content.length > 4_000
              ? `${file.content.slice(0, 4_000)}\n…`
              : file.content;
          sections.push(`--- ${hit.path} (@codebase) ---\n${snippet}`);
        } catch {
          /* skip */
        }
      }
    }
  }

  const webQuery = extractWebQuery(content);
  if (webQuery && webSearchService.isConfigured()) {
    const results = await webSearchService.search(webQuery, 5);
    if (results.length > 0) {
      sections.push(
        `[Web results for "${webQuery.slice(0, 100)}"]\n${results
          .map((r) => `- ${r.title}\n  ${r.url}\n  ${r.snippet}`)
          .join("\n")}`
      );
    }
  }

  const docsUrls = extractDocsUrls(content);
  for (const url of docsUrls.slice(0, 3)) {
    const text = await webSearchService.fetchDocs(url);
    if (text) {
      sections.push(`[Docs: ${url}]\n${text}`);
    }
  }

  if (sections.length === 0) {
    return { displayContent: content, agentContent: content };
  }

  const agentContent = `${content}\n\n[Context]\n${sections.join("\n\n")}`;
  return { displayContent: content, agentContent };
}

/** Strip Cursor-style frontmatter; return body and whether globs match any path. */
function parseRuleFile(
  content: string,
  matchPaths?: string[]
): { body: string; applies: boolean } {
  const fm = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content);
  if (!fm) return { body: content, applies: true };
  const [, header, body] = fm;
  const alwaysApply = /alwaysApply:\s*true/i.test(header);
  const globsMatch = /globs:\s*(.+)/i.exec(header);
  if (alwaysApply || !globsMatch) return { body, applies: true };
  if (!matchPaths || matchPaths.length === 0) {
    return { body, applies: false };
  }
  const globs = globsMatch[1]
    .split(",")
    .map((g) => g.trim().replace(/^["'[\]]+|["'[\]]+$/g, ""))
    .filter(Boolean);
  const applies = matchPaths.some((p) =>
    globs.some((g) => globToRegex(g).test(p))
  );
  return { body, applies };
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*\*/g, "§§")
    .replace(/\*/g, "[^/]*")
    .replace(/§§/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`(^|/)${escaped}$`);
}

/**
 * Rules hierarchy (Cursor-style):
 * 1. User rules (account-level, all projects)
 * 2. Project rules (settings field)
 * 3. `.cursor/rules/*.md` + `AGENTS.md` files in the project VFS
 *    (frontmatter `globs:` scopes a rule to matching paths)
 */
export async function getProjectRulesBlock(
  projectId: string,
  opts?: { userId?: string; matchPaths?: string[] }
): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { agentRules: true, userId: true },
  });

  const parts: string[] = [];

  const ownerId = opts?.userId ?? project?.userId;
  if (ownerId) {
    const user = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { agentRules: true },
    });
    const userRules = user?.agentRules?.trim();
    if (userRules) {
      parts.push(`USER RULES (apply to all projects):\n${userRules}`);
    }
  }

  const projectRules = project?.agentRules?.trim();
  if (projectRules) {
    parts.push(`PROJECT RULES (follow strictly):\n${projectRules}`);
  }

  try {
    const ruleFiles = await prisma.file.findMany({
      where: {
        projectId,
        OR: [
          { path: { startsWith: ".cursor/rules/" } },
          { path: "AGENTS.md" },
        ],
      },
      select: { path: true, content: true },
      orderBy: { path: "asc" },
      take: 20,
    });
    for (const f of ruleFiles) {
      const { body, applies } = parseRuleFile(f.content, opts?.matchPaths);
      const trimmed = body.trim();
      if (applies && trimmed) {
        parts.push(`RULE FILE ${f.path}:\n${trimmed.slice(0, 4000)}`);
      }
    }
  } catch {
    /* rules files are best-effort */
  }

  if (parts.length === 0) return "";
  return `\n\n${parts.join("\n\n")}`;
}
