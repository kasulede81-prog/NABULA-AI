export type AgentType =
  | "requirements"
  | "planning"
  | "architecture"
  | "ui_generation"
  | "backend_generation"
  | "database"
  | "testing"
  | "refactoring"
  | "deployment"
  | "github"
  | "review"
  // Phase 1 legacy
  | "planner"
  | "coding"
  | "reviewer"
  | "debugger";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled";

export type LLMProvider = "openai" | "anthropic" | "google" | "deepseek";

export interface AgentRun {
  id: string;
  projectId: string;
  userId: string;
  conversationId: string | null;
  agentType: AgentType;
  status: AgentRunStatus;
  llmProvider: LLMProvider;
  llmModel: string;
  inputPrompt: string;
  outputSummary: string | null;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface PlannedTask {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  phase: string;
  dependencies: string[];
  estimatedFiles: string[];
  acceptanceCriteria: string[];
}

export interface PlannerOutput {
  summary: string;
  appType: string;
  techStack: {
    frontend: string;
    backend: string;
    database: string;
    styling: string;
    auth: string;
  };
  architecture: {
    description: string;
    components: string[];
    folderStructure: string[];
  };
  phases: Array<{ name: string; description: string; taskIds: string[] }>;
  tasks: PlannedTask[];
}
