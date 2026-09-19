DROP TRIGGER IF EXISTS benchmark_system_tag_update;
DROP TRIGGER IF EXISTS benchmark_system_tag_delete;
DELETE FROM benchmark_tags WHERE id = 'uncategorized';
