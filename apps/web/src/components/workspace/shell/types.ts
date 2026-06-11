export type WorkspaceView =
  | "agent"
  | "database"
  | "deployments"
  | "domains"
  | "env"
  | "logs"
  | "history"
  | "team"
  | "rules"
  | "agents"
  | "mcp";

export interface ProjectListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
}
