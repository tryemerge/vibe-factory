-- Fix workflow foreign key constraint to prevent deletion failures
-- When a workflow is deleted, unassign tasks (SET NULL) instead of failing

-- SQLite doesn't support modifying foreign key constraints directly
-- We need to recreate the column

-- Step 1: Drop the existing index (will be recreated later)
DROP INDEX IF EXISTS idx_tasks_workflow;

-- Step 2: Create temporary column with correct constraint
ALTER TABLE tasks ADD COLUMN workflow_id_new TEXT REFERENCES workflows(id) ON DELETE SET NULL;

-- Step 3: Copy existing data
UPDATE tasks SET workflow_id_new = workflow_id;

-- Step 4: Drop old column
ALTER TABLE tasks DROP COLUMN workflow_id;

-- Step 5: Rename new column to original name
ALTER TABLE tasks RENAME COLUMN workflow_id_new TO workflow_id;

-- Step 6: Recreate index
CREATE INDEX idx_tasks_workflow ON tasks(workflow_id);
