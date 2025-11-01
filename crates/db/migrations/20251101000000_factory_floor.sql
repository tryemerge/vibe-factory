-- Factory Floor Integration: Multi-agent workflows and visual workflow designer
-- This migration adds support for:
-- - Global agent pool (reusable across all projects)
-- - Workflows (assembly lines for projects)
-- - Workflow stations (processing nodes)
-- - Station steps (linear agent sequences within stations)
-- - Station transitions (flow between stations)
-- - Task step execution tracking

-- Global agent pool (reusable across all projects)
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    capabilities TEXT, -- JSON array
    tools TEXT, -- JSON array
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Workflows define the assembly line for a project
CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, name)
);

-- Stations are processing nodes in a workflow
CREATE TABLE workflow_stations (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    description TEXT,
    x_position REAL NOT NULL DEFAULT 0,
    y_position REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Station steps define the agent sequence within a station
CREATE TABLE station_steps (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    position INTEGER NOT NULL,
    step_prompt TEXT, -- Additional instructions for this step
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Transitions define flow between stations
CREATE TABLE station_transitions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    source_station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    target_station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    condition TEXT, -- Future: conditional logic (JSON)
    label TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Link tasks to workflows
ALTER TABLE tasks ADD COLUMN workflow_id TEXT REFERENCES workflows(id);
ALTER TABLE tasks ADD COLUMN current_station_id TEXT REFERENCES workflow_stations(id);

-- Track station step execution
CREATE TABLE task_step_executions (
    id TEXT PRIMARY KEY,
    task_attempt_id TEXT NOT NULL REFERENCES task_attempts(id) ON DELETE CASCADE,
    station_step_id TEXT NOT NULL REFERENCES station_steps(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
