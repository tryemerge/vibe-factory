-- Add is_terminator field to workflow_stations
-- Terminator stations automatically trigger PR creation and workflow completion

ALTER TABLE workflow_stations ADD COLUMN is_terminator INTEGER NOT NULL DEFAULT 0;

-- Add index for querying terminator stations
CREATE INDEX idx_workflow_stations_is_terminator ON workflow_stations(workflow_id, is_terminator);
