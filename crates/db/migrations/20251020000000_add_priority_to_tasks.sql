-- Add priority column to tasks for task prioritization
-- Priority can be 'normal' or 'high'
-- Default is 'normal' for most tasks

ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';

-- Backfill existing tasks with normal priority
UPDATE tasks SET priority = 'normal';

-- Add check constraint to ensure only valid priorities
-- SQLite doesn't support CHECK constraints in ALTER TABLE, so we recreate the constraint via a trigger
CREATE TRIGGER check_task_priority_insert
BEFORE INSERT ON tasks
WHEN NEW.priority NOT IN ('normal', 'high')
BEGIN
    SELECT RAISE(ABORT, 'Invalid priority. Must be ''normal'' or ''high''');
END;

CREATE TRIGGER check_task_priority_update
BEFORE UPDATE OF priority ON tasks
WHEN NEW.priority NOT IN ('normal', 'high')
BEGIN
    SELECT RAISE(ABORT, 'Invalid priority. Must be ''normal'' or ''high''');
END;
