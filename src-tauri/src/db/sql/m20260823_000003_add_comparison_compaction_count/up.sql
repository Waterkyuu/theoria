ALTER TABLE comparison_results
ADD COLUMN compaction_count INTEGER
CHECK (compaction_count IS NULL OR compaction_count >= 0);
