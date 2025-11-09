-- Add terminator flag to workflow stations
-- When execution reaches a terminator station, it triggers final actions
-- (e.g., PR creation, workflow completion)

ALTER TABLE workflow_stations
ADD COLUMN is_terminator BOOLEAN NOT NULL DEFAULT 0;

-- Add index for efficient querying of terminator stations
CREATE INDEX idx_workflow_stations_is_terminator
ON workflow_stations(workflow_id, is_terminator);
