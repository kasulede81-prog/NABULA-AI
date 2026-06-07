-- Nebula AI — Production Database Schema
-- PostgreSQL 16+
-- Run via: psql or Prisma migrate

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Enums
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE project_status AS ENUM ('draft', 'planning', 'building', 'review', 'completed', 'archived', 'failed');
CREATE TYPE conversation_type AS ENUM ('general', 'planning', 'coding', 'debug');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'blocked', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE file_action AS ENUM ('create', 'update', 'delete', 'rename');
CREATE TYPE commit_status AS ENUM ('pending', 'committed', 'pushed', 'failed');
CREATE TYPE agent_type AS ENUM ('planner', 'coding', 'reviewer', 'debugger');
CREATE TYPE agent_run_status AS ENUM ('queued', 'running', 'waiting_input', 'completed', 'failed', 'cancelled');
CREATE TYPE llm_provider AS ENUM ('openai', 'anthropic', 'google', 'deepseek');
CREATE TYPE auth_provider AS ENUM ('email', 'google', 'github');

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT NOT NULL UNIQUE,
    password_hash   TEXT,                          -- NULL for OAuth-only users
    name            VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    role            user_role NOT NULL DEFAULT 'user',
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_oauth_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        auth_provider NOT NULL,
    provider_id     VARCHAR(255) NOT NULL,
    access_token    TEXT,                          -- encrypted at app layer
    refresh_token   TEXT,                          -- encrypted at app layer
    token_expires_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_id)
);

CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- ─────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    description     TEXT,
    prompt          TEXT NOT NULL,                 -- original user request
    status          project_status NOT NULL DEFAULT 'draft',
    tech_stack      JSONB DEFAULT '[]',            -- detected/selected stack
    metadata        JSONB DEFAULT '{}',            -- app type, features, etc.
    github_repo_url TEXT,
    github_repo_id  BIGINT,
    default_branch  VARCHAR(100) DEFAULT 'main',
    llm_provider    llm_provider DEFAULT 'anthropic',
    llm_model       VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at     TIMESTAMPTZ,
    UNIQUE (user_id, slug)
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- ─────────────────────────────────────────────
-- CONVERSATIONS & MESSAGES
-- ─────────────────────────────────────────────
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(255),
    type            conversation_type NOT NULL DEFAULT 'general',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_project_id ON conversations(project_id);

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            message_role NOT NULL,
    content         TEXT NOT NULL,
    content_type    VARCHAR(50) DEFAULT 'text',    -- text, markdown, code, tool_result
    metadata        JSONB DEFAULT '{}',            -- tokens, model, tool calls
    agent_run_id    UUID,                          -- FK added after agent_runs table
    parent_id       UUID REFERENCES messages(id),  -- threading
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_agent_run_id ON messages(agent_run_id);

-- ─────────────────────────────────────────────
-- TASKS (Planner Agent output)
-- ─────────────────────────────────────────────
CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id  UUID REFERENCES tasks(id),     -- sub-task hierarchy
    agent_run_id    UUID,                          -- FK added after agent_runs
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    status          task_status NOT NULL DEFAULT 'pending',
    priority        task_priority NOT NULL DEFAULT 'medium',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    estimated_files JSONB DEFAULT '[]',            -- predicted file paths
    dependencies    UUID[] DEFAULT '{}',           -- task IDs that must complete first
    result_summary  TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_project_id ON tasks(project_id, sort_order);
CREATE INDEX idx_tasks_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_agent_run_id ON tasks(agent_run_id);

-- ─────────────────────────────────────────────
-- FILES (Virtual File System)
-- ─────────────────────────────────────────────
CREATE TABLE files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path            TEXT NOT NULL,                 -- e.g. src/components/Header.tsx
    content         TEXT,                          -- NULL if binary, stored in S3
    content_hash    TEXT,                          -- SHA-256 for dedup
    storage_key     TEXT,                          -- S3 key for large/binary files
    mime_type       VARCHAR(100) DEFAULT 'text/plain',
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    version         INTEGER NOT NULL DEFAULT 1,
    is_directory    BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    agent_run_id    UUID,                          -- who wrote this version
    parent_version_id UUID REFERENCES files(id),   -- previous version chain
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active (non-deleted) version per path per project
CREATE UNIQUE INDEX idx_files_active_path
    ON files(project_id, path)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_files_project_id ON files(project_id);
CREATE INDEX idx_files_version ON files(project_id, path, version DESC);
CREATE INDEX idx_files_agent_run_id ON files(agent_run_id);

-- ─────────────────────────────────────────────
-- COMMITS (GitHub sync tracking)
-- ─────────────────────────────────────────────
CREATE TABLE commits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_run_id    UUID,                          -- FK added after agent_runs
    sha             VARCHAR(40),                   -- Git commit SHA after push
    message         TEXT NOT NULL,
    branch          VARCHAR(100) NOT NULL DEFAULT 'main',
    status          commit_status NOT NULL DEFAULT 'pending',
    files_changed   INTEGER NOT NULL DEFAULT 0,
    additions       INTEGER NOT NULL DEFAULT 0,
    deletions       INTEGER NOT NULL DEFAULT 0,
    github_url      TEXT,
    error_message   TEXT,
    committed_at    TIMESTAMPTZ,
    pushed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commits_project_id ON commits(project_id, created_at DESC);
CREATE INDEX idx_commits_agent_run_id ON commits(agent_run_id);
CREATE UNIQUE INDEX idx_commits_agent_run_unique ON commits(agent_run_id) WHERE agent_run_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- AGENT RUNS (Orchestration core)
-- ─────────────────────────────────────────────
CREATE TABLE agent_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id),
    agent_type      agent_type NOT NULL,
    status          agent_run_status NOT NULL DEFAULT 'queued',
    llm_provider    llm_provider NOT NULL,
    llm_model       VARCHAR(100) NOT NULL,
    input_prompt    TEXT NOT NULL,
    output_summary  TEXT,
    plan_json       JSONB,                         -- planner output (structured)
    tool_calls      JSONB DEFAULT '[]',            -- executed tool invocations
    tokens_input    INTEGER DEFAULT 0,
    tokens_output   INTEGER DEFAULT 0,
    cost_usd        DECIMAL(10, 6) DEFAULT 0,
    error_message   TEXT,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    max_retries     INTEGER NOT NULL DEFAULT 3,
    parent_run_id   UUID REFERENCES agent_runs(id), -- chained agent runs
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_runs_project_id ON agent_runs(project_id, created_at DESC);
CREATE INDEX idx_agent_runs_status ON agent_runs(status) WHERE status IN ('queued', 'running');
CREATE INDEX idx_agent_runs_user_id ON agent_runs(user_id);

-- Add deferred FKs
ALTER TABLE messages
    ADD CONSTRAINT fk_messages_agent_run
    FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL;

ALTER TABLE tasks
    ADD CONSTRAINT fk_tasks_agent_run
    FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL;

ALTER TABLE files
    ADD CONSTRAINT fk_files_agent_run
    FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL;

ALTER TABLE commits
    ADD CONSTRAINT fk_commits_agent_run
    FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- PROJECT MEMORY (semantic + structured)
-- ─────────────────────────────────────────────
CREATE TABLE project_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key             VARCHAR(255) NOT NULL,         -- e.g. "tech_decisions", "user_preferences"
    value           JSONB NOT NULL,
    source          VARCHAR(100),                  -- planner, coding, user, system
    agent_run_id    UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, key)
);

CREATE INDEX idx_project_memory_project_id ON project_memory(project_id);

-- ─────────────────────────────────────────────
-- GITHUB CONNECTIONS
-- ─────────────────────────────────────────────
CREATE TABLE github_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    github_user_id  BIGINT NOT NULL,
    github_username VARCHAR(255) NOT NULL,
    installation_id BIGINT,                        -- GitHub App installation
    access_token    TEXT,                          -- encrypted
    refresh_token   TEXT,                          -- encrypted
    token_expires_at TIMESTAMPTZ,
    scopes          TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

-- ─────────────────────────────────────────────
-- ORCHESTRATION EVENTS (audit + real-time)
-- ─────────────────────────────────────────────
CREATE TABLE orchestration_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_run_id    UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
    event_type      VARCHAR(100) NOT NULL,         -- task.started, file.created, etc.
    payload         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orchestration_events_project
    ON orchestration_events(project_id, created_at DESC);
CREATE INDEX idx_orchestration_events_agent_run
    ON orchestration_events(agent_run_id, created_at);

-- ─────────────────────────────────────────────
-- TRIGGERS: updated_at auto-update
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_files_updated_at BEFORE UPDATE ON files
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_agent_runs_updated_at BEFORE UPDATE ON agent_runs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_memory_updated_at BEFORE UPDATE ON project_memory
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_github_connections_updated_at BEFORE UPDATE ON github_connections
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
