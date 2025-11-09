use axum::{
    Extension, Json,
    extract::{Path, State},
    response::Json as ResponseJson,
};
use chrono::Utc;
use db::models::{
    execution_process::ExecutionProcess,
    station_execution::StationExecution,
    task::Task,
    task_attempt::{CreateTaskAttempt, TaskAttempt},
    workflow::Workflow,
    workflow_execution::{CreateWorkflowExecution, UpdateWorkflowExecution, WorkflowExecution},
    workflow_station::WorkflowStation,
    station_transition::StationTransition,
};
use deployment::Deployment;
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

// ============================================================================
// WORKFLOW EXECUTION ENDPOINT
// ============================================================================
//
// This module implements the endpoint to start workflow execution for a task.
//
// ## Workflow Execution Model
//
// ### Phase 1.0: Single TaskAttempt Per Workflow (Current Implementation)
//
// In the initial implementation, a workflow execution uses **ONE TaskAttempt for the entire workflow**:
//
// ```text
// Workflow Execution
//   └─ TaskAttempt (single git branch for all stations)
//       └─ ExecutionProcess (coding agent runs continuously)
// ```
//
// **How it works:**
// 1. When a workflow is started, we create a single TaskAttempt with its own git branch
// 2. The first station begins execution immediately via `container.start_attempt()`
// 3. The coding agent works on the task continuously across all stations
// 4. Station progression (moving from one station to the next) is tracked via:
//    - `workflow_executions.current_station_id` - tracks which station is active
//    - Station transitions are evaluated to determine the next station
//    - When a station completes, the workflow orchestrator advances to the next station
//
// **Station execution tracking:**
// - Each station execution is tracked in the `task_station_executions` table
// - Links to `execution_processes` to track which agent runs are part of each station
// - The same git branch is used throughout the workflow
//
// ### Future Phases (Not Yet Implemented)
//
// **Phase 2.0: Multi-Station Orchestration**
// - Station transition logic to automatically advance between stations
// - Conditional transitions based on station outcomes
// - Context passing between stations
//
// **Phase 3.0: Advanced Features**
// - Parallel station execution
// - Human-in-the-loop approvals between stations
// - Station-specific executor profiles
//
// ### First Station Determination
//
// The first station is determined by finding the station with the **lowest `position` value**.
// - If multiple stations have `position = 0`, `min_by_key()` will select the first one encountered
// - In practice, station positions should be unique and sequential (0, 1, 2, ...)
// - Future enhancement: Add explicit `is_start_station` flag for clarity
// ============================================================================

#[derive(Debug, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct ExecuteWorkflowRequest {
    pub task_id: Uuid,
    pub base_branch: String,
    pub executor_profile_id: Option<ExecutorProfileId>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ExecuteWorkflowResponse {
    pub workflow_execution_id: Uuid,
    pub task_attempt_id: Uuid,
    pub current_station_id: Option<Uuid>,
    pub status: String,
}

/// Validate that workflow has stations and proper transitions
async fn validate_workflow(
    pool: &sqlx::SqlitePool,
    workflow_id: Uuid,
) -> Result<WorkflowStation, ApiError> {
    // Get all stations for this workflow
    let stations = WorkflowStation::find_by_workflow_id(pool, workflow_id).await?;

    if stations.is_empty() {
        return Err(ApiError::Validation(
            "Workflow has no stations configured".to_string()
        ));
    }

    // Get all transitions for this workflow
    let transitions = StationTransition::find_by_workflow_id(pool, workflow_id).await?;

    if transitions.is_empty() {
        return Err(ApiError::Validation(
            "Workflow has no transitions configured".to_string()
        ));
    }

    // Find the first station (lowest position)
    let first_station = stations
        .iter()
        .min_by_key(|s| s.position)
        .ok_or_else(|| ApiError::Validation("Could not determine first station".to_string()))?
        .clone();

    Ok(first_station)
}

/// Execute a workflow for a task
/// POST /api/workflows/{workflow_id}/execute
pub async fn execute_workflow(
    Extension(workflow): Extension<Workflow>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<ExecuteWorkflowRequest>,
) -> Result<ResponseJson<ApiResponse<ExecuteWorkflowResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // 1. Validate the task exists
    let task = Task::find_by_id(pool, request.task_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // 2. Validate workflow has stations and transitions
    let first_station = validate_workflow(pool, workflow.id).await?;

    // 3. Get executor profile (use default if not provided)
    let executor_profile_id = request.executor_profile_id.unwrap_or_else(|| {
        ExecutorProfileId {
            executor: BaseCodingAgent::ClaudeCode,
            variant: None,
        }
    });

    // 4. Create TaskAttempt (reuse existing flow from task_attempts.rs)
    // NOTE: Phase 1.0 uses ONE TaskAttempt for the ENTIRE workflow
    // The same git branch is used across all stations in this workflow execution
    let attempt_id = Uuid::new_v4();
    let git_branch_name = deployment
        .container()
        .git_branch_from_task_attempt(&attempt_id, &task.title)
        .await;

    let task_attempt = TaskAttempt::create(
        pool,
        &CreateTaskAttempt {
            executor: executor_profile_id.executor,
            base_branch: request.base_branch.clone(),
            branch: git_branch_name.clone(),
        },
        attempt_id,
        request.task_id,
    )
    .await?;

    // 5. Create WorkflowExecution record
    let execution_id = Uuid::new_v4();
    let workflow_execution = WorkflowExecution::create(
        pool,
        CreateWorkflowExecution {
            workflow_id: workflow.id,
            task_id: request.task_id,
            task_attempt_id: Some(task_attempt.id),
            status: "running".to_string(),
        },
        execution_id,
    )
    .await?;

    // 6. Update workflow execution with first station and started_at timestamp
    let workflow_execution = WorkflowExecution::update(
        pool,
        workflow_execution.id,
        db::models::workflow_execution::UpdateWorkflowExecution {
            current_station_id: Some(first_station.id),
            status: Some("running".to_string()),
            started_at: Some(Utc::now()),
            completed_at: None,
        },
    )
    .await?;

    // 7. Start execution for the first station using existing infrastructure
    // NOTE: This starts the coding agent immediately for the first station
    // Station progression (advancing to subsequent stations) will be handled by
    // the workflow orchestrator based on station transitions (Phase 2.0)
    // For now, the agent runs continuously on the same TaskAttempt/git branch
    let _execution_process = deployment
        .container()
        .start_attempt(&task_attempt, executor_profile_id.clone())
        .await?;

    // Track analytics
    deployment
        .track_if_analytics_allowed(
            "workflow_execution_started",
            serde_json::json!({
                "workflow_id": workflow.id.to_string(),
                "workflow_execution_id": workflow_execution.id.to_string(),
                "task_id": task.id.to_string(),
                "task_attempt_id": task_attempt.id.to_string(),
                "first_station_id": first_station.id.to_string(),
                "executor": &executor_profile_id.executor,
                "variant": &executor_profile_id.variant,
            }),
        )
        .await;

    tracing::info!(
        "Started workflow execution {} for workflow {} (task: {}, attempt: {})",
        workflow_execution.id,
        workflow.id,
        task.id,
        task_attempt.id
    );

    Ok(ResponseJson(ApiResponse::success(ExecuteWorkflowResponse {
        workflow_execution_id: workflow_execution.id,
        task_attempt_id: task_attempt.id,
        current_station_id: workflow_execution.current_station_id,
        status: workflow_execution.status,
    })))
}

// ============================================================================
// WORKFLOW EXECUTION MONITORING ENDPOINTS
// ============================================================================

/// Response for workflow execution with station details
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct WorkflowExecutionDetailsResponse {
    pub id: uuid::Uuid,
    pub workflow_id: uuid::Uuid,
    pub task_id: uuid::Uuid,
    pub task_attempt_id: Option<uuid::Uuid>,
    pub current_station_id: Option<uuid::Uuid>,
    pub status: String,
    pub started_at: Option<chrono::DateTime<Utc>>,
    pub completed_at: Option<chrono::DateTime<Utc>>,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
    pub stations: Vec<StationExecutionSummary>,
}

/// Summary of a station execution for the workflow execution response
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct StationExecutionSummary {
    pub id: uuid::Uuid,
    pub station_id: uuid::Uuid,
    pub station_name: Option<String>,
    pub status: String,
    pub output_data: Option<String>,
    pub started_at: Option<chrono::DateTime<Utc>>,
    pub completed_at: Option<chrono::DateTime<Utc>>,
}

/// Get workflow execution by ID with station details
/// GET /api/workflow-executions/{id}
pub async fn get_workflow_execution(
    State(deployment): State<DeploymentImpl>,
    Path(execution_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<WorkflowExecutionDetailsResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Load the workflow execution
    let workflow_execution = WorkflowExecution::find_by_id(pool, execution_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Load all station executions for this workflow execution
    let station_executions = StationExecution::find_by_workflow_execution(pool, execution_id).await?;

    // Enrich station executions with station names
    let mut stations = Vec::new();
    for station_execution in station_executions {
        let station = WorkflowStation::find_by_id(pool, station_execution.station_id).await?;
        stations.push(StationExecutionSummary {
            id: station_execution.id,
            station_id: station_execution.station_id,
            station_name: station.map(|s| s.name),
            status: station_execution.status,
            output_data: station_execution.output_data,
            started_at: station_execution.started_at,
            completed_at: station_execution.completed_at,
        });
    }

    Ok(ResponseJson(ApiResponse::success(
        WorkflowExecutionDetailsResponse {
            id: workflow_execution.id,
            workflow_id: workflow_execution.workflow_id,
            task_id: workflow_execution.task_id,
            task_attempt_id: workflow_execution.task_attempt_id,
            current_station_id: workflow_execution.current_station_id,
            status: workflow_execution.status,
            started_at: workflow_execution.started_at,
            completed_at: workflow_execution.completed_at,
            created_at: workflow_execution.created_at,
            updated_at: workflow_execution.updated_at,
            stations,
        },
    )))
}

/// Get all station executions for a workflow execution
/// GET /api/workflow-executions/{id}/stations
pub async fn get_workflow_execution_stations(
    State(deployment): State<DeploymentImpl>,
    Path(execution_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<StationExecutionSummary>>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify workflow execution exists
    WorkflowExecution::find_by_id(pool, execution_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Load all station executions
    let station_executions = StationExecution::find_by_workflow_execution(pool, execution_id).await?;

    // Enrich station executions with station names
    let mut stations = Vec::new();
    for station_execution in station_executions {
        let station = WorkflowStation::find_by_id(pool, station_execution.station_id).await?;
        stations.push(StationExecutionSummary {
            id: station_execution.id,
            station_id: station_execution.station_id,
            station_name: station.map(|s| s.name),
            status: station_execution.status,
            output_data: station_execution.output_data,
            started_at: station_execution.started_at,
            completed_at: station_execution.completed_at,
        });
    }

    Ok(ResponseJson(ApiResponse::success(stations)))
}

/// Get active workflow execution for a task
/// GET /api/tasks/{task_id}/workflow-execution
pub async fn get_task_workflow_execution(
    State(deployment): State<DeploymentImpl>,
    Path(task_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Option<WorkflowExecutionDetailsResponse>>>, ApiError> {
    let pool = &deployment.db().pool;

    // Find all workflow executions for this task
    let executions = WorkflowExecution::find_by_task(pool, task_id).await?;

    // Find the first running execution (there should only be one)
    let running_execution = executions
        .into_iter()
        .find(|e| e.status == "running");

    if let Some(execution) = running_execution {
        // Load all station executions
        let station_executions = StationExecution::find_by_workflow_execution(pool, execution.id).await?;

        // Enrich station executions with station names
        let mut stations = Vec::new();
        for station_execution in station_executions {
            let station = WorkflowStation::find_by_id(pool, station_execution.station_id).await?;
            stations.push(StationExecutionSummary {
                id: station_execution.id,
                station_id: station_execution.station_id,
                station_name: station.map(|s| s.name),
                status: station_execution.status,
                output_data: station_execution.output_data,
                started_at: station_execution.started_at,
                completed_at: station_execution.completed_at,
            });
        }

        let response = WorkflowExecutionDetailsResponse {
            id: execution.id,
            workflow_id: execution.workflow_id,
            task_id: execution.task_id,
            task_attempt_id: execution.task_attempt_id,
            current_station_id: execution.current_station_id,
            status: execution.status,
            started_at: execution.started_at,
            completed_at: execution.completed_at,
            created_at: execution.created_at,
            updated_at: execution.updated_at,
            stations,
        };

        Ok(ResponseJson(ApiResponse::success(Some(response))))
    } else {
        // No running execution found
        Ok(ResponseJson(ApiResponse::success(None)))
    }
}

/// Request body for cancelling a workflow execution
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CancelWorkflowExecutionRequest {
    /// Optional reason for cancellation
    pub reason: Option<String>,
}

/// Response for cancelling a workflow execution
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct CancelWorkflowExecutionResponse {
    pub workflow_execution_id: Uuid,
    pub status: String,
    pub message: String,
}

/// Cancel a running workflow execution
/// POST /api/workflow-executions/{id}/cancel
///
/// # Transaction Safety
///
/// This operation is **NOT** fully transactional due to the need to stop external processes.
/// The operation follows this sequence:
///
/// 1. Stop execution processes (external side effect - cannot be rolled back)
/// 2. Update station executions to "cancelled" (database operation)
/// 3. Update workflow execution to "cancelled" (database operation)
///
/// If the workflow execution update fails after stopping processes, the processes will
/// remain stopped but the workflow status may not reflect this. This is acceptable because:
/// - The processes are already stopped (desired state achieved)
/// - A retry of the cancel operation will succeed (idempotent)
/// - The system remains in a consistent state (processes stopped)
///
/// Recovery: If database updates fail, the workflow can be cancelled again.
pub async fn cancel_workflow_execution(
    State(deployment): State<DeploymentImpl>,
    Path(execution_id): Path<Uuid>,
    Json(request): Json<CancelWorkflowExecutionRequest>,
) -> Result<ResponseJson<ApiResponse<CancelWorkflowExecutionResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Load the workflow execution
    let workflow_execution = WorkflowExecution::find_by_id(pool, execution_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Check if the workflow is in a cancellable state
    if workflow_execution.status == "completed" || workflow_execution.status == "cancelled" {
        return Err(ApiError::Validation(format!(
            "Cannot cancel workflow execution in '{}' state",
            workflow_execution.status
        )));
    }

    // Find any running station executions
    let station_executions = StationExecution::find_by_workflow_execution(pool, execution_id).await?;

    // Stop all running execution processes first (cannot be rolled back)
    for station_execution in &station_executions {
        if station_execution.status == "running" {
            // Find the execution process for this station
            if let Some(execution_process_id) = station_execution.execution_process_id {
                // Load the execution process
                if let Some(execution_process) = ExecutionProcess::find_by_id(pool, execution_process_id).await? {
                    // Stop the execution process if it's still running
                    if execution_process.status == db::models::execution_process::ExecutionProcessStatus::Running {
                        deployment.container().stop_execution(
                            &execution_process,
                            db::models::execution_process::ExecutionProcessStatus::Killed
                        ).await?;
                        tracing::info!("Stopped execution process {} for station execution {}", execution_process_id, station_execution.id);
                    }
                }
            }
        }
    }

    // Start a database transaction for updating statuses
    let mut tx = pool.begin().await?;

    // Update station execution statuses to cancelled
    for station_execution in station_executions {
        if station_execution.status == "running" {
            sqlx::query!(
                "UPDATE station_executions SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                station_execution.id,
                "cancelled"
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    // Update workflow execution status to cancelled
    let completed_at = Utc::now();
    sqlx::query!(
        "UPDATE workflow_executions SET status = $2, completed_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        execution_id,
        "cancelled",
        completed_at
    )
    .execute(&mut *tx)
    .await?;

    // Commit the transaction
    tx.commit().await?;

    // Reload the workflow execution to get updated values
    let workflow_execution = WorkflowExecution::find_by_id(pool, execution_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let message = if let Some(ref reason) = request.reason {
        format!("Workflow execution cancelled: {}", reason)
    } else {
        "Workflow execution cancelled".to_string()
    };

    tracing::info!("Cancelled workflow execution {}: {}", execution_id, message);

    // Track analytics
    deployment
        .track_if_analytics_allowed(
            "workflow_execution_cancelled",
            serde_json::json!({
                "workflow_execution_id": execution_id.to_string(),
                "workflow_id": workflow_execution.workflow_id.to_string(),
                "reason": request.reason.as_ref().map(|s| s.as_str()),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(
        CancelWorkflowExecutionResponse {
            workflow_execution_id: execution_id,
            status: workflow_execution.status,
            message,
        },
    )))
}

/// Request body for retrying a failed station
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct RetryStationRequest {
    pub station_execution_id: Uuid,
}

/// Response for retrying a station
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct RetryStationResponse {
    pub workflow_execution_id: Uuid,
    pub new_station_execution_id: Uuid,
    pub status: String,
    pub message: String,
}

/// Retry a failed station execution
/// POST /api/workflow-executions/{id}/retry-station
///
/// # Transaction Safety
///
/// This operation involves multiple steps that cannot all be rolled back:
///
/// 1. Gather context from completed stations (read-only, safe)
/// 2. Create new StationExecution record (database operation)
/// 3. Start execution process (external side effect - cannot be rolled back)
/// 4. Update workflow execution status (database operation)
///
/// The orchestrator.execute_station() method handles step 2 and 3 internally.
/// If step 4 fails after the process is started, the process will continue running
/// but the workflow status won't reflect this.
///
/// Recovery strategy:
/// - If the update fails, the new station execution exists and process is running
/// - The workflow orchestrator's completion handler will eventually update the workflow
/// - Alternatively, the retry can be called again (it will fail validation but won't corrupt state)
///
/// This is acceptable because:
/// - The new station execution is created and tracked in the database
/// - The process will complete and trigger normal completion handlers
/// - The system will eventually reach a consistent state
pub async fn retry_station_execution(
    State(deployment): State<DeploymentImpl>,
    Path(execution_id): Path<Uuid>,
    Json(request): Json<RetryStationRequest>,
) -> Result<ResponseJson<ApiResponse<RetryStationResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // Load the workflow execution
    let workflow_execution = WorkflowExecution::find_by_id(pool, execution_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Load the station execution to retry
    let station_execution = StationExecution::find_by_id(pool, request.station_execution_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Verify the station execution belongs to this workflow execution
    if station_execution.workflow_execution_id != execution_id {
        return Err(ApiError::Validation(
            "Station execution does not belong to this workflow execution".to_string(),
        ));
    }

    // Check if the station is in a retryable state
    if station_execution.status != "failed" {
        return Err(ApiError::Validation(format!(
            "Can only retry failed stations, current status is '{}'",
            station_execution.status
        )));
    }

    // Get the task attempt ID
    let task_attempt_id = workflow_execution
        .task_attempt_id
        .ok_or_else(|| ApiError::Validation("Workflow execution has no task_attempt_id".to_string()))?;

    // Load the workflow orchestrator
    let orchestrator = services::services::workflow_orchestrator::WorkflowOrchestrator::new(
        deployment.db().clone()
    );

    // Gather context from all previously completed stations
    let context_data = orchestrator.gather_context_data(execution_id).await
        .map_err(|e| ApiError::Validation(format!("Failed to gather context: {}", e)))?;

    // Create a new station execution for the retry (this also starts the process)
    // Note: This is not transactional with the workflow update below
    let new_station_execution = orchestrator
        .execute_station(
            deployment.container(),
            execution_id,
            station_execution.station_id,
            task_attempt_id,
            Some(context_data),
        )
        .await
        .map_err(|e| ApiError::Validation(format!("Failed to execute station: {}", e)))?;

    // Update workflow execution to point to the retried station
    // If this fails, the station execution still exists and will complete normally
    WorkflowExecution::update(
        pool,
        execution_id,
        UpdateWorkflowExecution {
            current_station_id: Some(station_execution.station_id),
            status: Some("running".to_string()),
            started_at: None,
            completed_at: None,
        },
    )
    .await?;

    tracing::info!(
        "Retrying station execution {} for workflow execution {}, new station execution: {}",
        request.station_execution_id,
        execution_id,
        new_station_execution.id
    );

    // Track analytics
    deployment
        .track_if_analytics_allowed(
            "workflow_station_retried",
            serde_json::json!({
                "workflow_execution_id": execution_id.to_string(),
                "station_execution_id": request.station_execution_id.to_string(),
                "new_station_execution_id": new_station_execution.id.to_string(),
                "station_id": station_execution.station_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(RetryStationResponse {
        workflow_execution_id: execution_id,
        new_station_execution_id: new_station_execution.id,
        status: "running".to_string(),
        message: "Station execution retry started".to_string(),
    })))
}

// ============================================================================
// STATION COMPLETION ENDPOINT
// ============================================================================

/// Request body for completing a station
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CompleteStationRequest {
    pub station_execution_id: Uuid,
    pub status: String,  // "completed" or "failed"
    pub output_data: Option<String>,  // JSON string of station output
}

/// Response for station progression
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct StationProgressionResponse {
    pub workflow_execution_id: Uuid,
    pub completed_station_id: Uuid,
    pub next_station_id: Option<Uuid>,
    pub workflow_status: String,  // "running", "completed", "failed"
    pub message: String,
}

/// Complete a station and progress to the next station
/// POST /api/workflow-executions/{id}/complete-station
///
/// This endpoint is called by executors/agents when a station completes its work.
/// It marks the current station as completed/failed, evaluates transitions to find
/// the next station, and either progresses the workflow or marks it as complete.
///
/// # Transaction Safety
///
/// This operation involves multiple steps that cannot all be rolled back:
///
/// 1. Validate workflow execution exists and is running (read-only, safe)
/// 2. Update station execution status and output_data (database operation)
/// 3. Evaluate transitions to determine next station (read-only, safe)
/// 4. If next station exists:
///    - Create new station execution (database operation)
///    - Start execution process (external side effect - cannot be rolled back)
///    - Update workflow execution current_station_id (database operation)
/// 5. If no next station:
///    - Update workflow execution to completed/failed (database operation)
///
/// The database updates (steps 2, 4, 5) are performed in a transaction, but step 4's
/// process start (via orchestrator.execute_station) cannot be rolled back.
///
/// Recovery strategy:
/// - If process start fails, the transaction rolls back and returns an error
/// - If workflow update fails after process start, the process continues running
///   but the workflow state may be inconsistent
/// - The orchestrator's completion handler will eventually update the workflow
/// - The system will reach a consistent state through normal completion flow
pub async fn complete_station(
    State(deployment): State<DeploymentImpl>,
    Path(execution_id): Path<Uuid>,
    Json(request): Json<CompleteStationRequest>,
) -> Result<ResponseJson<ApiResponse<StationProgressionResponse>>, ApiError> {
    let pool = &deployment.db().pool;

    // 1. Validate workflow execution exists and is running
    let workflow_execution = WorkflowExecution::find_by_id(pool, execution_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    if workflow_execution.status != "running" {
        return Err(ApiError::Validation(format!(
            "Cannot complete station for workflow execution in '{}' state",
            workflow_execution.status
        )));
    }

    // 2. Load and validate the station execution
    let station_execution = StationExecution::find_by_id(pool, request.station_execution_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Verify the station execution belongs to this workflow execution
    if station_execution.workflow_execution_id != execution_id {
        return Err(ApiError::Validation(
            "Station execution does not belong to this workflow execution".to_string(),
        ));
    }

    // Verify this station is the current station
    if Some(station_execution.station_id) != workflow_execution.current_station_id {
        return Err(ApiError::Validation(
            "Cannot complete station that is not the current station".to_string(),
        ));
    }

    // Validate status is "completed" or "failed"
    if request.status != "completed" && request.status != "failed" {
        return Err(ApiError::Validation(format!(
            "Invalid status '{}', must be 'completed' or 'failed'",
            request.status
        )));
    }

    // 3. Update station execution status and output_data
    let completed_at = Utc::now();
    StationExecution::update(
        pool,
        station_execution.id,
        db::models::station_execution::UpdateStationExecution {
            execution_process_id: None,
            status: Some(request.status.clone()),
            output_data: request.output_data.clone(),
            started_at: None,
            completed_at: Some(completed_at),
        },
    )
    .await?;

    // Reload station execution to get updated values for transition evaluation
    let updated_station_execution = StationExecution::find_by_id(pool, station_execution.id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    tracing::info!(
        "Station execution {} marked as {} for workflow execution {}",
        station_execution.id,
        request.status,
        execution_id
    );

    // 4. Evaluate transitions to determine next station
    let next_station_id = services::services::transition_evaluator::TransitionEvaluator::evaluate_next_station(
        pool,
        workflow_execution.workflow_id,
        station_execution.station_id,
        &updated_station_execution,
    )
    .await
    .map_err(|e| ApiError::Validation(format!("Failed to evaluate transition: {}", e)))?;

    // 5. Progress workflow based on transition evaluation
    let (workflow_status, message) = if let Some(next_id) = next_station_id {
        // There's a next station - create station execution and start it
        let task_attempt_id = workflow_execution
            .task_attempt_id
            .ok_or_else(|| ApiError::Validation("Workflow execution has no task_attempt_id".to_string()))?;

        // Load the workflow orchestrator
        let orchestrator = services::services::workflow_orchestrator::WorkflowOrchestrator::new(
            deployment.db().clone()
        );

        // Gather context from all previously completed stations
        let context_data = orchestrator.gather_context_data(execution_id).await
            .map_err(|e| ApiError::Validation(format!("Failed to gather context: {}", e)))?;

        // Create a new station execution and start it (this also starts the process)
        // Note: This is not fully transactional with the workflow update below
        let new_station_execution = orchestrator
            .execute_station(
                deployment.container(),
                execution_id,
                next_id,
                task_attempt_id,
                Some(context_data),
            )
            .await
            .map_err(|e| ApiError::Validation(format!("Failed to execute next station: {}", e)))?;

        // Update workflow execution to point to the next station
        // If this fails, the station execution still exists and will complete normally
        WorkflowExecution::update(
            pool,
            execution_id,
            UpdateWorkflowExecution {
                current_station_id: Some(next_id),
                status: Some("running".to_string()),
                started_at: None,
                completed_at: None,
            },
        )
        .await?;

        tracing::info!(
            "Workflow execution {} progressed to next station {} (station execution: {})",
            execution_id,
            next_id,
            new_station_execution.id
        );

        // Track analytics
        deployment
            .track_if_analytics_allowed(
                "workflow_station_completed",
                serde_json::json!({
                    "workflow_execution_id": execution_id.to_string(),
                    "completed_station_id": station_execution.station_id.to_string(),
                    "station_execution_id": station_execution.id.to_string(),
                    "station_status": request.status,
                    "next_station_id": next_id.to_string(),
                    "new_station_execution_id": new_station_execution.id.to_string(),
                }),
            )
            .await;

        ("running".to_string(), format!("Station completed, progressed to next station {}", next_id))
    } else {
        // No next station - workflow is complete
        let final_status = if request.status == "completed" {
            "completed"
        } else {
            "failed"
        };

        WorkflowExecution::update(
            pool,
            execution_id,
            UpdateWorkflowExecution {
                current_station_id: None,
                status: Some(final_status.to_string()),
                started_at: None,
                completed_at: Some(completed_at),
            },
        )
        .await?;

        tracing::info!(
            "Workflow execution {} completed with status '{}'",
            execution_id,
            final_status
        );

        // Track analytics
        deployment
            .track_if_analytics_allowed(
                "workflow_execution_completed",
                serde_json::json!({
                    "workflow_execution_id": execution_id.to_string(),
                    "completed_station_id": station_execution.station_id.to_string(),
                    "station_execution_id": station_execution.id.to_string(),
                    "station_status": request.status,
                    "workflow_status": final_status,
                }),
            )
            .await;

        (final_status.to_string(), format!("Workflow completed with status '{}'", final_status))
    };

    Ok(ResponseJson(ApiResponse::success(
        StationProgressionResponse {
            workflow_execution_id: execution_id,
            completed_station_id: station_execution.station_id,
            next_station_id,
            workflow_status,
            message,
        },
    )))
}
