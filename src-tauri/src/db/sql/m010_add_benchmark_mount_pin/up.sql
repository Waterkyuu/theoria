ALTER TABLE workspace_benchmarks ADD COLUMN pinned_at_ms INTEGER
    CHECK (pinned_at_ms IS NULL OR pinned_at_ms > 0);
CREATE INDEX idx_workspace_benchmarks_pin_history
    ON workspace_benchmarks(workspace_id, pinned_at_ms DESC, created_at_ms DESC);
