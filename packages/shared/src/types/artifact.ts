export type ArtifactType =
  | "specification"
  | "roadmap"
  | "architecture"
  | "api_contract"
  | "db_schema"
  | "design_system"
  | "test_report"
  | "review_report"
  | "refactor_report";

export interface Artifact<T = unknown> {
  id: string;
  projectId: string;
  type: ArtifactType;
  version: number;
  producerAgentRunId: string;
  content: T;
  contentHash: string;
  createdAt: string;
}

export interface Specification {
  version: number;
  appType: string;
  targetUsers: string[];
  coreFeatures: Array<{
    name: string;
    description: string;
    priority: "must" | "should" | "could";
  }>;
  nonFunctional: {
    scale: "prototype" | "production";
    platforms: ("web" | "mobile-responsive")[];
    accessibility: boolean;
  };
  explicitExclusions: string[];
  openQuestions: Array<{
    id: string;
    text: string;
    options?: string[];
    required: boolean;
  }>;
  confidence: number;
}

export interface Roadmap {
  version: number;
  summary: string;
  phases: Array<{
    name: string;
    description: string;
    milestoneIds: string[];
  }>;
  milestones: Array<{
    id: string;
    title: string;
    description: string;
    phase: string;
    dependencies: string[];
    estimatedComplexity: "low" | "medium" | "high";
    agentTypes: string[];
  }>;
}

export interface ArchitectureArtifact {
  version: number;
  stack: {
    frontend: string;
    backend: string;
    database: string;
    styling: string;
    auth: string;
    deployment: string;
  };
  frontend: {
    framework: string;
    routing: string;
    stateManagement: string;
    pages: Array<{ path: string; name: string; description: string }>;
  };
  backend: {
    framework: string;
    pattern: string;
    modules: string[];
  };
  database: {
    engine: string;
    orm: string;
    entities: Array<{ name: string; description: string }>;
  };
  conventions: {
    naming: string;
    fileStructure: string[];
    codeStyle: string;
  };
}

export interface ApiContract {
  version: number;
  baseUrl: string;
  endpoints: Array<{
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    description: string;
    auth: boolean;
    requestSchema?: Record<string, unknown>;
    responseSchema: Record<string, unknown>;
  }>;
  sharedTypes: Record<string, Record<string, unknown>>;
}
