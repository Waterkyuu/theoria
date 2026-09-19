ALTER TABLE tasks ADD COLUMN pinned_at_ms INTEGER
    CHECK (pinned_at_ms IS NULL OR pinned_at_ms > 0);
CREATE INDEX idx_tasks_scope_pin_history
    ON tasks(workspace_id, pinned_at_ms DESC, created_at_ms DESC);
