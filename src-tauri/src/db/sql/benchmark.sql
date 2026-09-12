CREATE TABLE benchmark_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 40),
    icon TEXT NOT NULL CHECK (length(icon) BETWEEN 1 AND 80),
    is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1))
);
CREATE TRIGGER benchmark_system_tag_update BEFORE UPDATE ON benchmark_tags
WHEN OLD.is_system = 1
BEGIN SELECT RAISE(ABORT, 'System tag is immutable'); END;
CREATE TRIGGER benchmark_system_tag_delete BEFORE DELETE ON benchmark_tags
WHEN OLD.is_system = 1
BEGIN SELECT RAISE(ABORT, 'System tag is immutable'); END;

CREATE TABLE benchmarks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 1000),
    tag_id TEXT NOT NULL REFERENCES benchmark_tags(id) ON DELETE RESTRICT,
    author TEXT NOT NULL CHECK (author IN ('platform', 'myself')),
    source TEXT,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
    updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms > 0)
);
CREATE INDEX idx_benchmarks_catalog ON benchmarks(archived, created_at_ms DESC, id);
CREATE INDEX idx_benchmarks_tag ON benchmarks(tag_id);

CREATE TABLE benchmark_drafts (
    id TEXT PRIMARY KEY,
    benchmark_id TEXT REFERENCES benchmarks(id) ON DELETE RESTRICT,
    revision INTEGER NOT NULL CHECK (revision > 0),
    content_json TEXT NOT NULL CHECK (json_valid(content_json)),
    updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms > 0)
);
CREATE UNIQUE INDEX idx_benchmark_draft_definition ON benchmark_drafts(benchmark_id);

CREATE TABLE benchmark_versions (
    id TEXT PRIMARY KEY,
    benchmark_id TEXT NOT NULL REFERENCES benchmarks(id) ON DELETE RESTRICT,
    number INTEGER NOT NULL CHECK (number > 0),
    content_json TEXT NOT NULL CHECK (json_valid(content_json)),
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
    UNIQUE (benchmark_id, number),
    UNIQUE (id, benchmark_id)
);
CREATE TRIGGER benchmark_versions_immutable BEFORE UPDATE ON benchmark_versions
BEGIN SELECT RAISE(ABORT, 'Published versions are immutable'); END;

CREATE TABLE benchmark_cases (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES benchmark_versions(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK (position >= 0),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    content_json TEXT NOT NULL CHECK (json_valid(content_json)),
    UNIQUE (version_id, position),
    UNIQUE (version_id, name),
    UNIQUE (id, version_id)
);
CREATE TRIGGER benchmark_cases_immutable BEFORE UPDATE ON benchmark_cases
BEGIN SELECT RAISE(ABORT, 'Published cases are immutable'); END;

CREATE TABLE workspace_benchmarks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    benchmark_id TEXT NOT NULL REFERENCES benchmarks(id) ON DELETE RESTRICT,
    version_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
    UNIQUE (workspace_id, benchmark_id),
    FOREIGN KEY (version_id, benchmark_id) REFERENCES benchmark_versions(id, benchmark_id) ON DELETE RESTRICT
);

CREATE TABLE benchmark_tasks (
    task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE RESTRICT,
    version_id TEXT NOT NULL REFERENCES benchmark_versions(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL UNIQUE,
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    rerun_of_task_id TEXT REFERENCES benchmark_tasks(task_id) ON DELETE RESTRICT,
    result_completeness TEXT NOT NULL DEFAULT 'incomplete' CHECK (result_completeness IN ('complete', 'incomplete')),
    completion_reason TEXT,
    cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0, 1)),
    UNIQUE (task_id, version_id)
);
CREATE TRIGGER benchmark_tasks_kind_insert BEFORE INSERT ON benchmark_tasks
WHEN NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.task_id AND kind = 'benchmark' AND workspace_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Benchmark requires a workspace benchmark task'); END;
CREATE TRIGGER benchmark_tasks_plan_immutable BEFORE UPDATE OF task_id, version_id, request_json, idempotency_key, rerun_of_task_id ON benchmark_tasks
BEGIN SELECT RAISE(ABORT, 'Execution plan is immutable'); END;

CREATE TABLE benchmark_task_agents (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES benchmark_tasks(task_id) ON DELETE RESTRICT,
    agent_kind TEXT NOT NULL CHECK (agent_kind IN ('codex', 'claude', 'opencode', 'workbuddy')),
    position INTEGER NOT NULL CHECK (position >= 0 AND position < 4),
    UNIQUE (task_id, agent_kind),
    UNIQUE (task_id, position),
    UNIQUE (task_id, id)
);
CREATE TABLE benchmark_task_cases (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (task_id, version_id) REFERENCES benchmark_tasks(task_id, version_id) ON DELETE RESTRICT,
    FOREIGN KEY (case_id, version_id) REFERENCES benchmark_cases(id, version_id) ON DELETE RESTRICT,
    UNIQUE (task_id, case_id),
    UNIQUE (task_id, position),
    UNIQUE (task_id, id)
);
CREATE TABLE benchmark_case_executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    task_case_id TEXT NOT NULL,
    task_agent_id TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'queued' CHECK (phase IN ('queued', 'preparing', 'running', 'waiting_permission', 'collecting', 'evaluating', 'stopping', 'finished')),
    termination_reason TEXT,
    session_id TEXT,
    response_text TEXT,
    metrics_json TEXT CHECK (metrics_json IS NULL OR json_valid(metrics_json)),
    started_at_ms INTEGER,
    finished_at_ms INTEGER,
    FOREIGN KEY (task_id, task_case_id) REFERENCES benchmark_task_cases(task_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (task_id, task_agent_id) REFERENCES benchmark_task_agents(task_id, id) ON DELETE RESTRICT,
    UNIQUE (task_id, task_case_id, task_agent_id),
    CHECK (started_at_ms IS NULL OR started_at_ms > 0),
    CHECK (finished_at_ms IS NULL OR finished_at_ms >= started_at_ms)
);
CREATE INDEX idx_benchmark_execution_queue ON benchmark_case_executions(phase, task_id);
CREATE TABLE benchmark_evaluations (
    execution_id TEXT PRIMARY KEY REFERENCES benchmark_case_executions(id) ON DELETE RESTRICT,
    verdict TEXT NOT NULL CHECK (verdict IN ('passed', 'failed')),
    validator_version INTEGER NOT NULL CHECK (validator_version > 0),
    report_json TEXT NOT NULL CHECK (json_valid(report_json)),
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0)
);
CREATE TRIGGER benchmark_evaluations_immutable BEFORE UPDATE ON benchmark_evaluations
BEGIN SELECT RAISE(ABORT, 'Final evaluation is immutable'); END;
