-- Add agent context configuration and task-agent assignment
-- This migration enables:
-- - Configurable context files for each agent (with file patterns and instructions)
-- - Direct assignment of agents to tasks
-- - Executor type specification for agents

-- Add context_files field to agents table (JSON array of context file configurations)
-- Each context file entry contains: { "pattern": "src/**/*.rs", "instruction": "Use for understanding Rust code" }
ALTER TABLE agents ADD COLUMN context_files TEXT; -- JSON array

-- Add executor field to agents table (which executor type to use: CLAUDE_CODE, GEMINI, etc.)
ALTER TABLE agents ADD COLUMN executor TEXT NOT NULL DEFAULT 'CLAUDE_CODE';

-- Add agent_id field to tasks table to assign an agent to each task
ALTER TABLE tasks ADD COLUMN agent_id TEXT REFERENCES agents(id);

-- Create index for faster agent lookups from tasks
CREATE INDEX idx_tasks_agent_id ON tasks(agent_id);
