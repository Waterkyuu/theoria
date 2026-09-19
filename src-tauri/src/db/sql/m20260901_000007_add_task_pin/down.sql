DROP INDEX idx_tasks_scope_pin_history;
ALTER TABLE tasks DROP COLUMN pinned_at_ms;
