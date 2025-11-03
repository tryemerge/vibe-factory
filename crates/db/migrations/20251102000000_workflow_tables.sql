-- Phase 1.1: Simplified Workflow Tables Migration
-- Architecture: One agent per station + conditional transitions for loops
-- Reference: /Users/the_dusky/code/emerge/vibe-factory/PHASE_1_TASKS.md
--
-- This migration refactors the factory floor schema from 20251101000000 to match the simplified spec

-- Drop old complex tables
DROP TABLE IF EXISTS task_step_executions;
DROP TABLE IF EXISTS station_steps;

-- Update workflow_stations - Add single agent per station fields
ALTER TABLE workflow_stations ADD COLUMN agent_id TEXT REFERENCES agents(id);
ALTER TABLE workflow_stations ADD COLUMN station_prompt TEXT;
ALTER TABLE workflow_stations ADD COLUMN output_context_keys TEXT; -- JSON array: ["design_doc", "api_spec"]

-- Update station_transitions - Add conditional flow fields
ALTER TABLE station_transitions ADD COLUMN condition_type TEXT DEFAULT 'always'; -- 'always', 'on_approval', 'on_rejection', 'on_tests_pass'
ALTER TABLE station_transitions ADD COLUMN condition_value TEXT; -- JSON for complex conditions

-- Create station_context table - Context accumulation as task progresses
CREATE TABLE station_context (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL,           -- e.g., "design_doc", "test_results"
    context_value TEXT NOT NULL,         -- File path, JSON data, or text
    context_type TEXT DEFAULT 'file',    -- 'file', 'decision', 'artifact'
    created_by_agent_id TEXT REFERENCES agents(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, station_id, context_key)
);

-- Create task_station_executions table - Track execution progress
CREATE TABLE task_station_executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    status TEXT NOT NULL,                -- 'pending', 'running', 'completed', 'failed'
    transition_taken_id TEXT REFERENCES station_transitions(id), -- Which transition was followed
    attempt_number INTEGER DEFAULT 1,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_workflow_stations_workflow ON workflow_stations(workflow_id);
CREATE INDEX idx_station_transitions_workflow ON station_transitions(workflow_id);
CREATE INDEX idx_station_context_task ON station_context(task_id);
CREATE INDEX idx_station_context_station ON station_context(station_id);
CREATE INDEX idx_task_station_executions_task ON task_station_executions(task_id);
CREATE INDEX idx_task_station_executions_station ON task_station_executions(station_id);
CREATE INDEX idx_task_station_executions_status ON task_station_executions(status);
CREATE INDEX idx_tasks_workflow ON tasks(workflow_id);
