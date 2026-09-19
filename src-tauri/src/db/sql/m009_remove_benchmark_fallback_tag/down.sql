ALTER TABLE benchmark_tags ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0
    CHECK (is_system IN (0, 1));
INSERT INTO benchmark_tags (id, name, icon, is_system)
VALUES ('uncategorized', 'Uncategorized', 'Tag', 1);
CREATE TRIGGER benchmark_system_tag_update BEFORE UPDATE ON benchmark_tags
WHEN OLD.is_system = 1
BEGIN SELECT RAISE(ABORT, 'System tag is immutable'); END;
CREATE TRIGGER benchmark_system_tag_delete BEFORE DELETE ON benchmark_tags
WHEN OLD.is_system = 1
BEGIN SELECT RAISE(ABORT, 'System tag is immutable'); END;
