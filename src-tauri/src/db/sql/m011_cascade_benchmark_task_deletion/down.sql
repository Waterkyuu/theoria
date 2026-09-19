PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE benchmark_tasks_new (
    task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE RESTRICT,
    version_id TEXT NOT NULL REFERENCES benchmark_versions(id) ON DELETE RESTRICT,
    idempotency_key TEXT NOT NULL UNIQUE,
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    rerun_of_task_id TEXT REFERENCES benchmark_tasks_new(task_id) ON DELETE RESTRICT,
    result_completeness TEXT NOT NULL DEFAULT 'incomplete' CHECK (result_completeness IN ('complete', 'incomplete')),
    completion_reason TEXT,
    cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0, 1)),
    UNIQUE (task_id, version_id)
);
CREATE TABLE benchmark_task_agents_new (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES benchmark_tasks_new(task_id) ON DELETE RESTRICT,
    agent_kind TEXT NOT NULL CHECK (agent_kind IN ('codex', 'claude', 'opencode', 'workbuddy')),
    position INTEGER NOT NULL CHECK (position >= 0 AND position < 4),
    UNIQUE (task_id, agent_kind),
    UNIQUE (task_id, position),
    UNIQUE (task_id, id)
);
CREATE TABLE benchmark_task_cases_new (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    version_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    FOREIGN KEY (task_id, version_id) REFERENCES benchmark_tasks_new(task_id, version_id) ON DELETE RESTRICT,
    FOREIGN KEY (case_id, version_id) REFERENCES benchmark_cases(id, version_id) ON DELETE RESTRICT,
    UNIQUE (task_id, case_id),
    UNIQUE (task_id, position),
    UNIQUE (task_id, id)
);
CREATE TABLE benchmark_case_executions_new (
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
    FOREIGN KEY (task_id, task_case_id) REFERENCES benchmark_task_cases_new(task_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (task_id, task_agent_id) REFERENCES benchmark_task_agents_new(task_id, id) ON DELETE RESTRICT,
    UNIQUE (task_id, task_case_id, task_agent_id),
    CHECK (started_at_ms IS NULL OR started_at_ms > 0),
    CHECK (finished_at_ms IS NULL OR finished_at_ms >= started_at_ms)
);
CREATE TABLE benchmark_evaluations_new (
    execution_id TEXT PRIMARY KEY REFERENCES benchmark_case_executions_new(id) ON DELETE RESTRICT,
    verdict TEXT NOT NULL CHECK (verdict IN ('passed', 'failed')),
    validator_version INTEGER NOT NULL CHECK (validator_version > 0),
    report_json TEXT NOT NULL CHECK (json_valid(report_json)),
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0)
);

INSERT INTO benchmark_tasks_new SELECT * FROM benchmark_tasks;
INSERT INTO benchmark_task_agents_new SELECT * FROM benchmark_task_agents;
INSERT INTO benchmark_task_cases_new SELECT * FROM benchmark_task_cases;
INSERT INTO benchmark_case_executions_new SELECT * FROM benchmark_case_executions;
INSERT INTO benchmark_evaluations_new SELECT * FROM benchmark_evaluations;

DROP TRIGGER benchmark_evaluations_immutable;
DROP TRIGGER benchmark_tasks_rerun_immutable;
DROP TRIGGER benchmark_tasks_plan_immutable;
DROP TRIGGER benchmark_tasks_kind_insert;
DROP INDEX idx_benchmark_execution_queue;
DROP TABLE benchmark_evaluations;
DROP TABLE benchmark_case_executions;
DROP TABLE benchmark_task_cases;
DROP TABLE benchmark_task_agents;
DROP TABLE benchmark_tasks;

ALTER TABLE benchmark_tasks_new RENAME TO benchmark_tasks;
ALTER TABLE benchmark_task_agents_new RENAME TO benchmark_task_agents;
ALTER TABLE benchmark_task_cases_new RENAME TO benchmark_task_cases;
ALTER TABLE benchmark_case_executions_new RENAME TO benchmark_case_executions;
ALTER TABLE benchmark_evaluations_new RENAME TO benchmark_evaluations;

CREATE TRIGGER benchmark_tasks_kind_insert BEFORE INSERT ON benchmark_tasks
WHEN NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.task_id AND kind = 'benchmark' AND workspace_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Benchmark requires a workspace benchmark task'); END;
CREATE TRIGGER benchmark_tasks_plan_immutable BEFORE UPDATE OF task_id, version_id, request_json, idempotency_key, rerun_of_task_id ON benchmark_tasks
BEGIN SELECT RAISE(ABORT, 'Execution plan is immutable'); END;
CREATE INDEX idx_benchmark_execution_queue ON benchmark_case_executions(phase, task_id);
CREATE TRIGGER benchmark_evaluations_immutable BEFORE UPDATE ON benchmark_evaluations
BEGIN SELECT RAISE(ABORT, 'Final evaluation is immutable'); END;

COMMIT;
PRAGMA foreign_keys = ON;
