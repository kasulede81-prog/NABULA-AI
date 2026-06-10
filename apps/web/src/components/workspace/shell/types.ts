export type WorkspaceView =
  | "agent"
  | "database"
  | "deployments"
  | "domains"
  | "env"
  | "logs"
  | "team"
  | "rules"
  | "agents";

export interface ProjectListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
}
