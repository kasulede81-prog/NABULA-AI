export type WorkspaceView =
  | "agent"
  | "database"
  | "deployments"
  | "domains"
  | "env"
  | "logs"
  | "team";

export interface ProjectListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
}
