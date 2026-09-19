CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_path TEXT NOT NULL,
    pinned_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    CHECK (source_kind IN ('external', 'managed')),
    CHECK (length(trim(name)) BETWEEN 1 AND 120),
    CHECK (length(source_path) > 0),
    CHECK (pinned_at_ms IS NULL OR pinned_at_ms > 0),
    CHECK (created_at_ms > 0),
    CHECK (updated_at_ms > 0)
);

CREATE UNIQUE INDEX idx_workspaces_source
    ON workspaces(source_path);

CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    folder_name TEXT NOT NULL COLLATE NOCASE,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    source_type TEXT NOT NULL,
    storage_relative_path TEXT NOT NULL,
    source_path TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    CHECK (length(folder_name) BETWEEN 1 AND 64),
    CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
    CHECK (source_type IN ('local_folder', 'platform', 'git')),
    CHECK (length(storage_relative_path) > 0),
    CHECK (created_at_ms > 0),
    CHECK (updated_at_ms > 0)
);

CREATE UNIQUE INDEX idx_skills_folder_name
    ON skills(folder_name);

CREATE TABLE workspace_skill_mounts (
    workspace_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    folder_name_snapshot TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, skill_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE RESTRICT,
    CHECK (length(folder_name_snapshot) BETWEEN 1 AND 64),
    CHECK (created_at_ms > 0)
);

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    configuration_locked_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    CHECK (length(trim(title)) BETWEEN 1 AND 120),
    CHECK (kind IN ('work', 'benchmark')),
    CHECK (kind != 'benchmark' OR workspace_id IS NOT NULL),
    CHECK (status IN ('preparing', 'running', 'waiting', 'completed', 'failed', 'stopped')),
    CHECK (configuration_locked_at_ms IS NULL OR configuration_locked_at_ms > 0),
    CHECK (created_at_ms > 0),
    CHECK (updated_at_ms > 0)
);

CREATE TABLE work_tasks (
    task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL CHECK (length(trim(prompt)) BETWEEN 1 AND 16000),
    baseline_relative_path TEXT NOT NULL CHECK (length(baseline_relative_path) > 0)
);

CREATE TRIGGER work_tasks_kind_insert BEFORE INSERT ON work_tasks
WHEN NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.task_id AND kind = 'work')
BEGIN SELECT RAISE(ABORT, 'Work inputs require a work task'); END;

CREATE TRIGGER work_tasks_kind_update BEFORE UPDATE OF task_id ON work_tasks
WHEN NOT EXISTS (SELECT 1 FROM tasks WHERE id = NEW.task_id AND kind = 'work')
BEGIN SELECT RAISE(ABORT, 'Work inputs require a work task'); END;

CREATE TRIGGER tasks_kind_immutable BEFORE UPDATE OF kind ON tasks
WHEN OLD.kind != NEW.kind
BEGIN SELECT RAISE(ABORT, 'Task kind is immutable'); END;

CREATE INDEX idx_tasks_scope_history
    ON tasks(workspace_id, created_at_ms DESC);

CREATE TABLE task_agents (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL,
    agent_kind TEXT NOT NULL,
    model_snapshot TEXT,
    mode_snapshot TEXT,
    session_id TEXT,
    execution_relative_path TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE (task_id, slot_index),
    CHECK (slot_index BETWEEN 0 AND 5),
    CHECK (agent_kind IN ('codex', 'claude', 'opencode', 'workbuddy')),
    CHECK (length(execution_relative_path) > 0),
    CHECK (status IN ('preparing', 'running', 'waiting', 'completed', 'failed', 'stopped')),
    CHECK (created_at_ms > 0),
    CHECK (updated_at_ms > 0)
);

CREATE TABLE task_permissions (
    task_id TEXT PRIMARY KEY,
    file_access TEXT NOT NULL,
    command_execution TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CHECK (file_access IN ('read_only', 'allow_edits')),
    CHECK (command_execution IN ('deny', 'ask', 'allow')),
    CHECK (created_at_ms > 0)
);

CREATE TABLE task_skills (
    task_id TEXT NOT NULL,
    folder_name TEXT NOT NULL COLLATE NOCASE,
    origin TEXT NOT NULL,
    library_skill_id TEXT,
    relative_path TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (task_id, folder_name),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (library_skill_id) REFERENCES skills(id) ON DELETE SET NULL,
    CHECK (origin IN ('workspace_source', 'workspace_mount', 'task_selection')),
    CHECK (length(folder_name) BETWEEN 1 AND 64),
    CHECK (length(relative_path) > 0),
    CHECK (created_at_ms > 0)
);

CREATE TABLE task_agent_results (
    task_agent_id TEXT PRIMARY KEY,
    final_status TEXT NOT NULL,
    response_text TEXT,
    changes_relative_path TEXT,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    FOREIGN KEY (task_agent_id) REFERENCES task_agents(id) ON DELETE CASCADE,
    CHECK (final_status IN ('completed', 'failed', 'stopped')),
    CHECK (json_valid(metrics_json)),
    CHECK (created_at_ms > 0),
    CHECK (updated_at_ms > 0)
);
