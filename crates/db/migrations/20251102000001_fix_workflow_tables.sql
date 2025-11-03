-- Phase 1.1 Fixes: Align with PHASE_1_TASKS.md spec
-- This migration corrects the previous migration to match the official spec

-- Fix 1: Update workflow_stations - rename step_prompt to station_prompt, add output_context_keys
ALTER TABLE workflow_stations RENAME COLUMN step_prompt TO station_prompt;
ALTER TABLE workflow_stations ADD COLUMN output_context_keys TEXT; -- JSON array: ["design_doc", "api_spec"]

-- Fix 2: Update station_transitions - rename condition_expression to condition_value
ALTER TABLE station_transitions RENAME COLUMN condition_expression TO condition_value;

-- Fix 3: Refactor station_context to match spec (key/value/type instead of JSON blob)
DROP TABLE station_context;

CREATE TABLE station_context (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL,           -- e.g., "design_doc", "test_results"
    context_value TEXT NOT NULL,         -- File path, JSON data, or text
    context_type TEXT DEFAULT 'file',    -- 'file', 'decision', 'artifact'
    created_by_agent_id TEXT REFERENCES agents(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, station_id, context_key)  -- Multiple context items per station
);

CREATE INDEX idx_station_context_task ON station_context(task_id);
CREATE INDEX idx_station_context_station ON station_context(station_id);

-- Fix 4: Update task_station_executions - add missing fields
-- Drop old indices first
DROP INDEX IF EXISTS idx_task_station_executions_attempt;
DROP INDEX IF EXISTS idx_task_station_executions_station;
DROP INDEX IF EXISTS idx_task_station_executions_status;

-- Add new columns
ALTER TABLE task_station_executions ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE task_station_executions ADD COLUMN transition_taken_id TEXT REFERENCES station_transitions(id);
ALTER TABLE task_station_executions ADD COLUMN attempt_number INTEGER DEFAULT 1;

-- Drop columns (SQLite doesn't support DROP COLUMN directly, need to recreate table)
-- For now, just leave output_context and task_attempt_id as deprecated
-- They can be removed in a future migration after data is migrated

-- Create new indices
CREATE INDEX idx_task_station_executions_task ON task_station_executions(task_id);
CREATE INDEX idx_task_station_executions_station ON task_station_executions(station_id);
CREATE INDEX idx_task_station_executions_status ON task_station_executions(status);
