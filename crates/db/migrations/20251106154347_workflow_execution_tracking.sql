-- Workflow Execution Tracking Tables
-- Tracks task execution through workflow stations

-- workflow_executions: Top-level workflow execution tracking
CREATE TABLE workflow_executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    task_attempt_id TEXT REFERENCES task_attempts(id) ON DELETE SET NULL,
    current_station_id TEXT REFERENCES workflow_stations(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- station_executions: Individual station execution tracking
CREATE TABLE station_executions (
    id TEXT PRIMARY KEY,
    workflow_execution_id TEXT NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    execution_process_id TEXT REFERENCES execution_processes(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    output_data TEXT, -- JSON data for station output_context_keys
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_task ON workflow_executions(task_id);
CREATE INDEX idx_workflow_executions_task_attempt ON workflow_executions(task_attempt_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);

CREATE INDEX idx_station_executions_workflow_execution ON station_executions(workflow_execution_id);
CREATE INDEX idx_station_executions_station ON station_executions(station_id);
CREATE INDEX idx_station_executions_execution_process ON station_executions(execution_process_id);
CREATE INDEX idx_station_executions_status ON station_executions(status);
