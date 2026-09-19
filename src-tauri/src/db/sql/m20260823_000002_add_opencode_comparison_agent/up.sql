PRAGMA foreign_keys = OFF;
CREATE TABLE comparison_results_new (
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
    CHECK (agent_kind IN ('codex', 'claude', 'opencode', 'workbuddy')),
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
INSERT INTO comparison_results_new (
    id, comparison_run_id, agent_kind, model, reasoning_effort, status, response,
    error_message, total_duration_ms, time_to_first_token_ms, thinking_duration_ms,
    total_tokens, input_tokens, cached_input_tokens, cache_write_input_tokens,
    output_tokens, reasoning_output_tokens
)
SELECT
    id, comparison_run_id, agent_kind, model, reasoning_effort, status, response,
    error_message, total_duration_ms, time_to_first_token_ms, thinking_duration_ms,
    total_tokens, input_tokens, cached_input_tokens, cache_write_input_tokens,
    output_tokens, reasoning_output_tokens
FROM comparison_results;
DROP TABLE comparison_results;
ALTER TABLE comparison_results_new RENAME TO comparison_results;
PRAGMA foreign_keys = ON;
