-- Nebula AI v2 — Platform Schema Extensions
-- Apply AFTER schema.sql (Phase 1 base)
-- PostgreSQL 16+

-- ─────────────────────────────────────────────
-- ENUM EXTENSIONS
-- ─────────────────────────────────────────────

ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'gathering_requirements';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'awaiting_clarification';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'architecting';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'generating';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'testing';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'deploying';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'preview_ready';

ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'requirements';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'planning';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'architecture';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'ui_generation';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'backend_generation';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'database';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'testing';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'refactoring';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'deployment';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'github';
ALTER TYPE agent_type ADD VALUE IF NOT EXISTS 'review';

-- New enums
CREATE TYPE workflow_run_status AS ENUM ('running', 'paused', 'completed', 'failed', 'cancelled');
CREATE TYPE workflow_node_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
CREATE TYPE artifact_type AS ENUM (
    'specification', 'roadmap', 'architecture', 'api_contract',
    'db_schema', 'design_system', 'test_report', 'review_report', 'refactor_report'
);
CREATE TYPE complexity_level AS ENUM ('low', 'medium', 'high');
CREATE TYPE build_run_type AS ENUM ('build', 'test', 'lint');
CREATE TYPE build_run_status AS ENUM ('queued', 'running', 'passed', 'failed', 'cancelled');
CREATE TYPE log_level AS ENUM ('info', 'warn', 'error');
CREATE TYPE clarification_status AS ENUM ('pending', 'answered', 'expired');
CREATE TYPE preview_status AS ENUM ('provisioning', 'ready', 'updating', 'stopped', 'error');
CREATE TYPE pr_status AS ENUM ('open', 'merged', 'closed');
CREATE TYPE deploy_environment AS ENUM ('preview', 'staging', 'production');
CREATE TYPE deploy_status AS ENUM ('pending', 'deploying', 'live', 'failed', 'rolled_back');
CREATE TYPE usage_category AS ENUM ('llm', 'sandbox', 'storage', 'preview');
CREATE TYPE lock_holder_type AS ENUM (
    'requirements', 'planning', 'architecture', 'ui_generation',
    'backend_generation', 'database', 'testing', 'refactoring',
    'deployment', 'github', 'review', 'integration'
);

-- ─────────────────────────────────────────────
-- PROJECTS (extend)
-- ─────────────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS workflow_status workflow_run_status;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS specification_version INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_cost_usd DECIMAL(10, 6) DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS complexity complexity_level;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS app_category VARCHAR(100);

-- ─────────────────────────────────────────────
-- WORKFLOW
-- ─────────────────────────────────────────────
CREATE TABLE workflow_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workflow_id         VARCHAR(100) NOT NULL,
    workflow_version    INTEGER NOT NULL DEFAULT 1,
    status              workflow_run_status NOT NULL DEFAULT 'running',
    current_node_id     VARCHAR(100),
    artifact_pins       JSONB DEFAULT '{}',
    paused_reason       VARCHAR(100),
    paused_gate_data    JSONB,
    total_cost_usd      DECIMAL(10, 6) DEFAULT 0,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_runs_project ON workflow_runs(project_id, created_at DESC);
CREATE INDEX idx_workflow_runs_active ON workflow_runs(status) WHERE status IN ('running', 'paused');

CREATE TABLE workflow_nodes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id     UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    node_id             VARCHAR(100) NOT NULL,
    agent_type          agent_type,
    node_type           VARCHAR(50) NOT NULL DEFAULT 'agent',
    status              workflow_node_status NOT NULL DEFAULT 'pending',
    agent_run_id        UUID REFERENCES agent_runs(id),
    build_run_id        UUID,
    depends_on          UUID[] DEFAULT '{}',
    sort_order          INTEGER NOT NULL DEFAULT 0,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_nodes_run ON workflow_nodes(workflow_run_id, sort_order);
CREATE INDEX idx_workflow_nodes_status ON workflow_nodes(workflow_run_id, status);

-- ─────────────────────────────────────────────
-- ARTIFACTS
-- ─────────────────────────────────────────────
CREATE TABLE artifacts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type                artifact_type NOT NULL,
    version             INTEGER NOT NULL,
    agent_run_id        UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    content             JSONB NOT NULL,
    content_hash        TEXT NOT NULL,
    storage_key         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, type, version)
);

CREATE INDEX idx_artifacts_project_type ON artifacts(project_id, type, version DESC);

-- ─────────────────────────────────────────────
-- MILESTONES
-- ─────────────────────────────────────────────
CREATE TABLE milestones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_run_id     UUID REFERENCES workflow_runs(id) ON DELETE CASCADE,
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    phase               VARCHAR(100),
    sort_order          INTEGER NOT NULL DEFAULT 0,
    status              task_status NOT NULL DEFAULT 'pending',
    dependencies        UUID[] DEFAULT '{}',
    estimated_complexity complexity_level DEFAULT 'medium',
    agent_types         TEXT[] DEFAULT '{}',
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_milestones_project ON milestones(project_id, sort_order);

-- ─────────────────────────────────────────────
-- CLARIFICATIONS
-- ─────────────────────────────────────────────
CREATE TABLE clarification_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_run_id     UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    agent_run_id        UUID REFERENCES agent_runs(id),
    round               INTEGER NOT NULL DEFAULT 1,
    questions           JSONB NOT NULL,
    answers             JSONB,
    status              clarification_status NOT NULL DEFAULT 'pending',
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at         TIMESTAMPTZ
);

CREATE INDEX idx_clarifications_pending
    ON clarification_requests(project_id, status) WHERE status = 'pending';

-- ─────────────────────────────────────────────
-- BUILD & TEST
-- ─────────────────────────────────────────────
CREATE TABLE build_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_node_id    UUID REFERENCES workflow_nodes(id),
    type                build_run_type NOT NULL,
    status              build_run_status NOT NULL DEFAULT 'queued',
    sandbox_id          VARCHAR(255),
    duration_ms         INTEGER,
    exit_code           INTEGER,
    error_summary       TEXT,
    tests_passed        INTEGER DEFAULT 0,
    tests_failed        INTEGER DEFAULT 0,
    tests_skipped       INTEGER DEFAULT 0,
    artifacts_path      TEXT,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_build_runs_project ON build_runs(project_id, created_at DESC);

ALTER TABLE workflow_nodes
    ADD CONSTRAINT fk_workflow_nodes_build_run
    FOREIGN KEY (build_run_id) REFERENCES build_runs(id) ON DELETE SET NULL;

CREATE TABLE build_logs (
    id                  BIGSERIAL PRIMARY KEY,
    build_run_id        UUID NOT NULL REFERENCES build_runs(id) ON DELETE CASCADE,
    line_number         INTEGER NOT NULL,
    level               log_level NOT NULL DEFAULT 'info',
    message             TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_build_logs_run ON build_logs(build_run_id, line_number);

-- ─────────────────────────────────────────────
-- PREVIEW
-- ─────────────────────────────────────────────
CREATE TABLE preview_environments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url                 TEXT,
    internal_url        TEXT,
    sandbox_id          VARCHAR(255),
    status              preview_status NOT NULL DEFAULT 'provisioning',
    last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_preview_active
    ON preview_environments(project_id) WHERE status IN ('provisioning', 'ready', 'updating');

-- ─────────────────────────────────────────────
-- FILE LOCKS
-- ─────────────────────────────────────────────
CREATE TABLE file_locks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path_pattern        TEXT NOT NULL,
    holder_type         lock_holder_type NOT NULL,
    holder_id           UUID NOT NULL,
    acquired_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_file_locks_project ON file_locks(project_id);
CREATE INDEX idx_file_locks_expires ON file_locks(expires_at);

-- ─────────────────────────────────────────────
-- GITHUB PRs
-- ─────────────────────────────────────────────
CREATE TABLE pull_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_run_id        UUID REFERENCES agent_runs(id),
    milestone_id        UUID REFERENCES milestones(id),
    github_pr_number    INTEGER NOT NULL,
    github_url          TEXT NOT NULL,
    title               VARCHAR(500) NOT NULL,
    source_branch       VARCHAR(255) NOT NULL,
    target_branch       VARCHAR(255) NOT NULL DEFAULT 'main',
    status              pr_status NOT NULL DEFAULT 'open',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    merged_at           TIMESTAMPTZ
);

CREATE INDEX idx_pull_requests_project ON pull_requests(project_id, created_at DESC);

-- ─────────────────────────────────────────────
-- DEPLOYMENTS
-- ─────────────────────────────────────────────
CREATE TABLE deployments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_run_id     UUID REFERENCES workflow_runs(id),
    environment         deploy_environment NOT NULL,
    status              deploy_status NOT NULL DEFAULT 'pending',
    url                 TEXT,
    config              JSONB DEFAULT '{}',
    deployed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deployments_project ON deployments(project_id, environment, created_at DESC);

-- ─────────────────────────────────────────────
-- USAGE & BILLING
-- ─────────────────────────────────────────────
CREATE TABLE usage_ledger (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_run_id        UUID REFERENCES agent_runs(id),
    build_run_id        UUID REFERENCES build_runs(id),
    provider            llm_provider,
    model               VARCHAR(100),
    tokens_input        INTEGER DEFAULT 0,
    tokens_output       INTEGER DEFAULT 0,
    cost_usd            DECIMAL(10, 6) NOT NULL,
    category            usage_category NOT NULL,
    description         VARCHAR(255),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_ledger_user ON usage_ledger(user_id, created_at DESC);
CREATE INDEX idx_usage_ledger_project ON usage_ledger(project_id, created_at DESC);

-- ─────────────────────────────────────────────
-- MODEL ROUTING
-- ─────────────────────────────────────────────
CREATE TABLE model_routing_config (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    defaults            JSONB NOT NULL DEFAULT '{}',
    fallback_chain      JSONB NOT NULL DEFAULT '[]',
    cost_ceiling_usd    DECIMAL(10, 2),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- AGENT_RUNS (extend)
-- ─────────────────────────────────────────────
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS workflow_node_id UUID REFERENCES workflow_nodes(id);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES milestones(id);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS artifact_ids UUID[] DEFAULT '{}';
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS model_routing_reason VARCHAR(255);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS files_written INTEGER DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS files_read INTEGER DEFAULT 0;

-- Triggers
CREATE TRIGGER trg_milestones_updated_at BEFORE UPDATE ON milestones
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_preview_updated_at BEFORE UPDATE ON preview_environments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_model_routing_updated_at BEFORE UPDATE ON model_routing_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
