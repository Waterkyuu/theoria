CREATE TABLE comparison_runs (
    id INTEGER PRIMARY KEY,
    query TEXT NOT NULL,
    status TEXT NOT NULL,
    metric_version INTEGER NOT NULL DEFAULT 1,
    created_at_ms INTEGER NOT NULL,
    CHECK (length(query) BETWEEN 1 AND 16000),
    CHECK (status IN ('completed', 'partial', 'failed')),
    CHECK (metric_version > 0),
    CHECK (created_at_ms > 0)
);

CREATE INDEX idx_comparison_runs_history
    ON comparison_runs (created_at_ms DESC, id DESC);

CREATE TABLE comparison_results (
    id INTEGER PRIMARY KEY,
    comparison_run_id INTEGER NOT NULL,
    agent_kind TEXT NOT NULL,
    model TEXT,
    reasoning_effort TEXT,
    status TEXT NOT NULL,
    response TEXT,
    error_message TEXT,
    total_duration_ms INTEGER,
    time_to_first_token_ms INTEGER,
    thinking_duration_ms INTEGER,
    total_tokens INTEGER,
    input_tokens INTEGER,
    cached_input_tokens INTEGER,
    cache_write_input_tokens INTEGER,
    output_tokens INTEGER,
    reasoning_output_tokens INTEGER,
    FOREIGN KEY (comparison_run_id)
        REFERENCES comparison_runs(id) ON DELETE CASCADE,
    UNIQUE (comparison_run_id, agent_kind),
    CHECK (agent_kind IN ('codex', 'claude', 'workbuddy')),
    CHECK (status IN ('succeeded', 'failed')),
    CHECK (total_duration_ms IS NULL OR total_duration_ms >= 0),
    CHECK (time_to_first_token_ms IS NULL OR time_to_first_token_ms >= 0),
    CHECK (thinking_duration_ms IS NULL OR thinking_duration_ms >= 0),
    CHECK (total_tokens IS NULL OR total_tokens >= 0),
    CHECK (input_tokens IS NULL OR input_tokens >= 0),
    CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
    CHECK (cache_write_input_tokens IS NULL OR cache_write_input_tokens >= 0),
    CHECK (output_tokens IS NULL OR output_tokens >= 0),
    CHECK (reasoning_output_tokens IS NULL OR reasoning_output_tokens >= 0),
    CHECK (
        (status = 'succeeded'
            AND response IS NOT NULL
            AND total_duration_ms IS NOT NULL
            AND thinking_duration_ms IS NOT NULL)
        OR
        (status = 'failed' AND error_message IS NOT NULL)
    )
);

CREATE TABLE comparison_tool_calls (
    id INTEGER PRIMARY KEY,
    comparison_result_id INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    name TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    FOREIGN KEY (comparison_result_id)
        REFERENCES comparison_results(id) ON DELETE CASCADE,
    UNIQUE (comparison_result_id, sequence),
    CHECK (sequence > 0),
    CHECK (length(name) BETWEEN 1 AND 256),
    CHECK (duration_ms >= 0)
);
