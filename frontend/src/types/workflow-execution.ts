/**
 * Temporary type definitions for workflow execution
 * These should be generated from Rust via ts-rs in the future
 */

export interface StationExecutionSummary {
  id: string;
  station_id: string;
  station_name: string | null;
  status: string;
  output_data: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowExecutionDetailsResponse {
  id: string;
  workflow_id: string;
  task_id: string;
  task_attempt_id: string | null;
  current_station_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  stations: StationExecutionSummary[];
}

export interface CancelWorkflowExecutionRequest {
  reason?: string | null;
}

export interface CancelWorkflowExecutionResponse {
  workflow_execution_id: string;
  status: string;
  message: string;
}

export interface RetryStationRequest {
  station_execution_id: string;
}

export interface RetryStationResponse {
  workflow_execution_id: string;
  new_station_execution_id: string;
  status: string;
  message: string;
}
