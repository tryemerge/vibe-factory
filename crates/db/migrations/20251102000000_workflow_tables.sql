-- Phase 1.1: Simplified Workflow Tables
-- This migration refactors the factory floor schema to:
-- - Single agent per station (no station_steps table)
-- - Conditional transitions for loops
-- - Context accumulation between stations
-- - Simplified execution tracking

-- Drop old tables from previous migration
DROP TABLE IF EXISTS task_step_executions;
DROP TABLE IF EXISTS station_steps;

-- Add agent_id directly to workflow_stations (one agent per station)
ALTER TABLE workflow_stations ADD COLUMN agent_id TEXT REFERENCES agents(id);
ALTER TABLE workflow_stations ADD COLUMN step_prompt TEXT; -- Instructions for this station's agent

-- Add condition_type to station_transitions for conditional flow
ALTER TABLE station_transitions ADD COLUMN condition_type TEXT; -- 'success', 'failure', 'always', 'conditional'
ALTER TABLE station_transitions ADD COLUMN condition_expression TEXT; -- JSON expression for conditional logic

-- Station context: accumulate context as task progresses through workflow
CREATE TABLE station_context (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    context_data TEXT NOT NULL, -- JSON object with accumulated context
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, station_id)
);

-- Track station execution (replaces task_step_executions)
CREATE TABLE task_station_executions (
    id TEXT PRIMARY KEY,
    task_attempt_id TEXT NOT NULL REFERENCES task_attempts(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    output_context TEXT, -- JSON output from this station's execution
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indices for performance
CREATE INDEX idx_station_context_task ON station_context(task_id);
CREATE INDEX idx_station_context_station ON station_context(station_id);
CREATE INDEX idx_task_station_executions_attempt ON task_station_executions(task_attempt_id);
CREATE INDEX idx_task_station_executions_station ON task_station_executions(station_id);
CREATE INDEX idx_task_station_executions_status ON task_station_executions(status);
