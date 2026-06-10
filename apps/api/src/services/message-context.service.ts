import { prisma } from "../lib/prisma";
import { vfsService } from "./vfs.service";

const MENTION_RE = /@([^\s@]+)/g;

export function extractMentionPaths(content: string): string[] {
  const paths = new Set<string>();
  for (const match of content.matchAll(MENTION_RE)) {
    const path = match[1]?.trim();
    if (path && (path.includes("/") || path.includes("."))) {
      paths.add(path);
    }
  }
  return [...paths];
}

export async function buildMessageContext(
  projectId: string,
  userId: string,
  content: string,
  attachedFiles?: string[]
): Promise<{ displayContent: string; agentContent: string }> {
  const paths = [
    ...new Set([...(attachedFiles ?? []), ...extractMentionPaths(content)]),
  ];

  if (paths.length === 0) {
    return { displayContent: content, agentContent: content };
  }

  const sections: string[] = [];
  for (const path of paths.slice(0, 20)) {
    try {
      const file = await vfsService.readFile(projectId, userId, path);
      const snippet =
        file.content.length > 12_000
          ? `${file.content.slice(0, 12_000)}\n… (truncated)`
          : file.content;
      sections.push(`--- ${path} ---\n${snippet}`);
    } catch {
      /* skip missing paths */
    }
  }

  if (sections.length === 0) {
    return { displayContent: content, agentContent: content };
  }

  const agentContent = `${content}\n\n[Referenced files]\n${sections.join("\n\n")}`;
  return { displayContent: content, agentContent };
}

export async function getProjectRulesBlock(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { agentRules: true },
  });
  const rules = project?.agentRules?.trim();
  if (!rules) return "";
  return `\n\nPROJECT RULES (follow strictly):\n${rules}`;
}
