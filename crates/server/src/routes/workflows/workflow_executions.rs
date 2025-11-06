use axum::{
    Extension, Json,
    extract::State,
    response::Json as ResponseJson,
};
use chrono::Utc;
use db::models::{
    task::Task,
    task_attempt::{CreateTaskAttempt, TaskAttempt},
    workflow::Workflow,
    workflow_execution::{CreateWorkflowExecution, WorkflowExecution},
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
