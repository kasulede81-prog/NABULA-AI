import { api } from "@/lib/api";

const LAST_PROJECT_KEY = "nebula_last_project_id";
const WORKSPACE_KEY = "nebula_workspace_id";

const STARTER_NAME = "My Project";
const STARTER_PROMPT =
  "Describe the app you want to build — I'll help you design and build it here.";

export function getStoredWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WORKSPACE_KEY);
}

export function setLastProjectId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_PROJECT_KEY, id);
}

export function getLastProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_PROJECT_KEY);
}

/** Opens the most recent project workspace, or creates a starter project. */
export async function resolveWorkspaceEntryPath(
  workspaceId?: string | null
): Promise<string> {
  const scopeId = workspaceId ?? getStoredWorkspaceId();
  const res = await api.listProjects(
    scopeId ? { workspaceId: scopeId } : { scope: "personal" }
  );

  const lastId = getLastProjectId();
  if (lastId && res.data.some((p) => p.id === lastId)) {
    return `/projects/${lastId}`;
  }

  if (res.data.length > 0) {
    const id = res.data[0].id;
    setLastProjectId(id);
    return `/projects/${id}`;
  }

  const project = await api.createProject(
    STARTER_NAME,
    STARTER_PROMPT,
    scopeId ?? undefined
  );
  setLastProjectId(project.id);
  return `/projects/${project.id}`;
}
