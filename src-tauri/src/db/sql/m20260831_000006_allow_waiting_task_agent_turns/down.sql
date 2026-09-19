DROP INDEX idx_task_agent_turns_agent_sequence;
CREATE TABLE task_agent_turns_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_agent_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    final_status TEXT NOT NULL,
    response_text TEXT,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    created_at_ms INTEGER NOT NULL,
    FOREIGN KEY (task_agent_id) REFERENCES task_agents(id) ON DELETE CASCADE,
    UNIQUE (task_agent_id, sequence),
    CHECK (sequence >= 0),
    CHECK (length(trim(prompt)) BETWEEN 1 AND 16000),
    CHECK (final_status IN ('completed', 'failed', 'stopped')),
    CHECK (json_valid(metrics_json)),
    CHECK (created_at_ms > 0)
);
INSERT INTO task_agent_turns_new
    (id, task_agent_id, sequence, prompt, final_status, response_text,
     metrics_json, created_at_ms)
SELECT id, task_agent_id, sequence, prompt, final_status, response_text,
       metrics_json, created_at_ms
FROM task_agent_turns
WHERE final_status <> 'waiting';
DROP TABLE task_agent_turns;
ALTER TABLE task_agent_turns_new RENAME TO task_agent_turns;
CREATE INDEX idx_task_agent_turns_agent_sequence
    ON task_agent_turns(task_agent_id, sequence);
