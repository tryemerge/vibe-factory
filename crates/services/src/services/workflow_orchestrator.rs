use std::str::FromStr;

use anyhow::{anyhow, Result};
use chrono::Utc;
use db::{
    DBService,
    models::{
        agent::Agent,
        execution_process::{ExecutionProcess, ExecutionProcessRunReason},
        station_execution::{CreateStationExecution, StationExecution, UpdateStationExecution},
        station_transition::StationTransition,
        task::{Task, TaskStatus},
        workflow::Workflow,
        workflow_execution::{UpdateWorkflowExecution, WorkflowExecution},
        workflow_station::WorkflowStation,
    },
};
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        coding_agent_follow_up::CodingAgentFollowUpRequest,
        coding_agent_initial::CodingAgentInitialRequest,
    },
    executors::BaseCodingAgent,
    profile::ExecutorProfileId,
};
use serde_json::Value as JsonValue;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::services::container::{ContainerError, ContainerService};

/// Result type for workflow orchestration operations
pub type WorkflowOrchestratorResult<T> = Result<T, WorkflowOrchestratorError>;

/// Errors that can occur during workflow orchestration
#[derive(Debug, thiserror::Error)]
pub enum WorkflowOrchestratorError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Container error: {0}")]
    Container(#[from] ContainerError),

    #[error("Workflow not found: {0}")]
    WorkflowNotFound(Uuid),

    #[error("Station not found: {0}")]
    StationNotFound(Uuid),

    #[error("Agent not found: {0}")]
    AgentNotFound(Uuid),

    #[error("No station configured for workflow")]
    NoStationConfigured,

    #[error("Failed to parse station output data: {0}")]
    OutputDataParseError(String),

    #[error("Failed to evaluate transition condition: {0}")]
    TransitionEvaluationError(String),

    #[error("No valid transition found from station {0}")]
    NoValidTransition(Uuid),

    #[error("Workflow execution not found: {0}")]
    WorkflowExecutionNotFound(Uuid),

    #[error("Other error: {0}")]
    Other(#[from] anyhow::Error),
}

/// Workflow orchestrator service for managing station execution
pub struct WorkflowOrchestrator {
    db: DBService,
}

impl WorkflowOrchestrator {
    /// Create a new workflow orchestrator
    pub fn new(db: DBService) -> Self {
        Self { db }
    }

    /// Get the database pool
    fn pool(&self) -> &SqlitePool {
        &self.db.pool
    }

    /// Execute a single station
    ///
    /// This function:
    /// 1. Builds the prompt from agent.system_prompt + station.station_prompt
    /// 2. Creates an ExecutionProcess with CodingAgentFollowUp/Initial request
    /// 3. Tracks the station_execution record
    /// 4. Handles output_context_keys (stores in station_executions.output_data)
    pub async fn execute_station<C: ContainerService + Sync>(
        &self,
        container_service: &C,
        workflow_execution_id: Uuid,
        station_id: Uuid,
        task_attempt_id: Uuid,
        context_data: Option<JsonValue>,
    ) -> WorkflowOrchestratorResult<StationExecution> {
        // Load the station
        let station = WorkflowStation::find_by_id(self.pool(), station_id)
            .await?
            .ok_or(WorkflowOrchestratorError::StationNotFound(station_id))?;

        // Load the agent for this station
        let agent_id = station
            .agent_id
            .ok_or_else(|| anyhow!("Station {} has no agent configured", station.id))?;

        let agent = Agent::find_by_id(self.pool(), agent_id)
            .await?
            .ok_or(WorkflowOrchestratorError::AgentNotFound(agent_id))?;

        // Build the prompt: agent.system_prompt + station.station_prompt + context
        let prompt = self.build_station_prompt(&agent, &station, context_data)?;

        // Create the station execution record
        let station_execution_id = Uuid::new_v4();
        let station_execution = StationExecution::create(
            self.pool(),
            CreateStationExecution {
                workflow_execution_id,
                station_id,
                status: "pending".to_string(),
                execution_process_id: None,
            },
            station_execution_id,
        )
        .await?;

        // Update station execution to "running"
        let station_execution = StationExecution::update(
            self.pool(),
            station_execution.id,
            UpdateStationExecution {
                status: Some("running".to_string()),
                started_at: Some(Utc::now()),
                execution_process_id: None,
                output_data: None,
                completed_at: None,
            },
        )
        .await?;

        // Get the task attempt
        let task_attempt =
            db::models::task_attempt::TaskAttempt::find_by_id(self.pool(), task_attempt_id)
                .await?
                .ok_or_else(|| anyhow!("Task attempt not found: {}", task_attempt_id))?;

        // Parse executor profile from agent.executor
        let executor_profile_id = self.parse_executor_profile(&agent.executor)?;

        // Determine if this is an initial request or a follow-up
        // Check if there are any previous execution processes for this task attempt
        let previous_processes =
            ExecutionProcess::find_by_task_attempt_id(self.pool(), task_attempt_id, false).await?;

        let executor_action = if previous_processes.is_empty() {
            // Initial request
            ExecutorAction::new(
                ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
                    prompt,
                    executor_profile_id,
                }),
                None,
            )
        } else {
            // Follow-up request - need to get session ID from previous execution
            let last_process = previous_processes
                .first()
                .ok_or_else(|| anyhow!("No previous execution process found"))?;

            let executor_session =
                db::models::executor_session::ExecutorSession::find_by_execution_process_id(
                    self.pool(),
                    last_process.id,
                )
                .await?
                .ok_or_else(|| anyhow!("No executor session found for previous process"))?;

            let session_id = executor_session
                .session_id
                .ok_or_else(|| anyhow!("Previous executor session has no session_id"))?;

            ExecutorAction::new(
                ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
                    prompt,
                    session_id,
                    executor_profile_id,
                }),
                None,
            )
        };

        // Start the execution
        let execution_process = container_service
            .start_execution(
                &task_attempt,
                &executor_action,
                &ExecutionProcessRunReason::CodingAgent,
            )
            .await?;

        // Update station execution with execution_process_id
        let station_execution = StationExecution::update(
            self.pool(),
            station_execution.id,
            UpdateStationExecution {
                execution_process_id: Some(execution_process.id),
                status: None,
                output_data: None,
                started_at: None,
                completed_at: None,
            },
        )
        .await?;

        tracing::info!(
            "Started station execution {} for station {} with execution process {}",
            station_execution.id,
            station_id,
            execution_process.id
        );

        Ok(station_execution)
    }

    /// Build the prompt for a station execution
    fn build_station_prompt(
        &self,
        agent: &Agent,
        station: &WorkflowStation,
        context_data: Option<JsonValue>,
    ) -> WorkflowOrchestratorResult<String> {
        let mut prompt = agent.system_prompt.clone();

        // Add station-specific instructions
        if let Some(station_prompt) = &station.station_prompt {
            prompt.push_str("\n\n");
            prompt.push_str("## Station Instructions\n");
            prompt.push_str(station_prompt);
        }

        // Add context data if available
        if let Some(context) = context_data {
            prompt.push_str("\n\n");
            prompt.push_str("## Context from Previous Stations\n");
            prompt.push_str(&serde_json::to_string_pretty(&context).map_err(|e| {
                WorkflowOrchestratorError::OutputDataParseError(format!(
                    "Failed to serialize context: {}",
                    e
                ))
            })?);
        }

        // Add output expectations if output_context_keys are defined
        if let Some(output_keys_json) = &station.output_context_keys {
            let output_keys: Vec<String> = serde_json::from_str(output_keys_json).map_err(|e| {
                WorkflowOrchestratorError::OutputDataParseError(format!(
                    "Failed to parse output_context_keys: {}",
                    e
                ))
            })?;

            if !output_keys.is_empty() {
                prompt.push_str("\n\n");
                prompt.push_str("## Expected Outputs\n");
                prompt.push_str("Please provide the following outputs:\n");
                for key in output_keys {
                    prompt.push_str(&format!("- {}\n", key));
                }
            }
        }

        Ok(prompt)
    }

    /// Parse executor profile from agent executor string
    fn parse_executor_profile(&self, executor: &str) -> WorkflowOrchestratorResult<ExecutorProfileId> {
        // Parse the executor string as a BaseCodingAgent
        let base_agent = BaseCodingAgent::from_str(executor).map_err(|_| {
            WorkflowOrchestratorError::Other(anyhow!(
                "Failed to parse executor type: {}",
                executor
            ))
        })?;

        // Create ExecutorProfileId with the parsed base agent
        Ok(ExecutorProfileId::new(base_agent))
    }

    /// Determine the next station to execute
    ///
    /// This function:
    /// 1. Evaluates transition conditions (if conditional)
    /// 2. Handles unconditional transitions
    /// 3. Returns the next station or None if workflow is complete
    pub async fn advance_to_next_station(
        &self,
        _workflow_execution_id: Uuid,
        current_station_id: Uuid,
        station_execution: &StationExecution,
    ) -> WorkflowOrchestratorResult<Option<Uuid>> {
        // Get all transitions from the current station
        let transitions =
            StationTransition::find_by_source_station(self.pool(), current_station_id).await?;

        if transitions.is_empty() {
            tracing::info!(
                "No transitions found from station {}, workflow complete",
                current_station_id
            );
            return Ok(None);
        }

        // Evaluate transitions to find the next station
        for transition in transitions {
            if self.evaluate_transition(&transition, station_execution).await? {
                tracing::info!(
                    "Transition {} matched, moving to station {}",
                    transition.id,
                    transition.target_station_id
                );
                return Ok(Some(transition.target_station_id));
            }
        }

        // No valid transition found
        Err(WorkflowOrchestratorError::NoValidTransition(
            current_station_id,
        ))
    }

    /// Evaluate whether a transition should be taken
    async fn evaluate_transition(
        &self,
        transition: &StationTransition,
        station_execution: &StationExecution,
    ) -> WorkflowOrchestratorResult<bool> {
        // Check condition_type
        match transition.condition_type.as_deref() {
            Some("always") | None => {
                // Always transition (default behavior)
                Ok(true)
            }
            Some("success") => {
                // Only transition if station succeeded
                Ok(station_execution.status == "completed")
            }
            Some("failure") => {
                // Only transition if station failed
                Ok(station_execution.status == "failed")
            }
            Some("conditional") => {
                // Evaluate condition_value expression
                if let Some(condition_value) = &transition.condition_value {
                    self.evaluate_condition_expression(condition_value, station_execution)
                        .await
                } else {
                    // No condition value provided, default to false
                    Ok(false)
                }
            }
            Some(unknown) => {
                tracing::warn!("Unknown condition_type: {}", unknown);
                Ok(false)
            }
        }
    }

    /// Evaluate a conditional expression
    ///
    /// For Phase 1.1, this is a simple implementation
    /// In the future, this could use a proper expression evaluator
    async fn evaluate_condition_expression(
        &self,
        condition_value: &str,
        station_execution: &StationExecution,
    ) -> WorkflowOrchestratorResult<bool> {
        // Parse condition_value as JSON
        let condition: JsonValue = serde_json::from_str(condition_value).map_err(|e| {
            WorkflowOrchestratorError::TransitionEvaluationError(format!(
                "Failed to parse condition JSON: {}",
                e
            ))
        })?;

        // Simple evaluation: check if output_data contains expected values
        // Example condition: {"check_output_key": "some_key", "expected_value": "some_value"}
        if let Some(output_data) = &station_execution.output_data {
            let output: JsonValue = serde_json::from_str(output_data).map_err(|e| {
                WorkflowOrchestratorError::OutputDataParseError(format!(
                    "Failed to parse station output data: {}",
                    e
                ))
            })?;

            // Check if the condition is met
            if let Some(check_key) = condition.get("check_output_key").and_then(|v| v.as_str()) {
                if let Some(expected_value) = condition.get("expected_value") {
                    if let Some(actual_value) = output.get(check_key) {
                        return Ok(actual_value == expected_value);
                    }
                }
            }
        }

        // Default to false if condition cannot be evaluated
        Ok(false)
    }

    /// Handle station completion
    ///
    /// This function:
    /// 1. Updates station_execution status
    /// 2. Checks if station succeeded/failed
    /// 3. Advances to next station or completes workflow
    /// 4. Moves task to "inreview" when all stations complete
    pub async fn handle_station_completion(
        &self,
        station_execution_id: Uuid,
        success: bool,
        output_data: Option<String>,
    ) -> WorkflowOrchestratorResult<()> {
        // Load the station execution
        let _station_execution = StationExecution::find_by_id(self.pool(), station_execution_id)
            .await?
            .ok_or(WorkflowOrchestratorError::Other(anyhow!(
                "Station execution not found: {}",
                station_execution_id
            )))?;

        // Update status and output data
        let status = if success { "completed" } else { "failed" };
        let station_execution = StationExecution::update(
            self.pool(),
            station_execution_id,
            UpdateStationExecution {
                status: Some(status.to_string()),
                output_data,
                completed_at: Some(Utc::now()),
                execution_process_id: None,
                started_at: None,
            },
        )
        .await?;

        tracing::info!(
            "Station execution {} completed with status: {}",
            station_execution_id,
            status
        );

        // Load the workflow execution
        let workflow_execution =
            WorkflowExecution::find_by_id(self.pool(), station_execution.workflow_execution_id)
                .await?
                .ok_or(WorkflowOrchestratorError::WorkflowExecutionNotFound(
                    station_execution.workflow_execution_id,
                ))?;

        // Only advance if the station succeeded
        if !success {
            tracing::warn!(
                "Station execution {} failed, not advancing to next station",
                station_execution_id
            );

            // Mark workflow execution as failed
            WorkflowExecution::update(
                self.pool(),
                workflow_execution.id,
                UpdateWorkflowExecution {
                    status: Some("failed".to_string()),
                    completed_at: Some(Utc::now()),
                    current_station_id: None,
                    started_at: None,
                },
            )
            .await?;

            return Ok(());
        }

        // Try to advance to the next station
        let next_station_id = self
            .advance_to_next_station(
                workflow_execution.id,
                station_execution.station_id,
                &station_execution,
            )
            .await?;

        match next_station_id {
            Some(next_station_id) => {
                // Update workflow execution with next station
                WorkflowExecution::update(
                    self.pool(),
                    workflow_execution.id,
                    UpdateWorkflowExecution {
                        current_station_id: Some(next_station_id),
                        status: None,
                        started_at: None,
                        completed_at: None,
                    },
                )
                .await?;

                tracing::info!(
                    "Advanced workflow execution {} to station {}",
                    workflow_execution.id,
                    next_station_id
                );
            }
            None => {
                // Workflow is complete
                WorkflowExecution::update(
                    self.pool(),
                    workflow_execution.id,
                    UpdateWorkflowExecution {
                        status: Some("completed".to_string()),
                        completed_at: Some(Utc::now()),
                        current_station_id: None,
                        started_at: None,
                    },
                )
                .await?;

                // Move task to "inreview"
                Task::update_status(self.pool(), workflow_execution.task_id, TaskStatus::InReview)
                    .await?;

                tracing::info!(
                    "Workflow execution {} completed, task {} moved to InReview",
                    workflow_execution.id,
                    workflow_execution.task_id
                );
            }
        }

        Ok(())
    }

    /// Get the first station of a workflow (by position)
    pub async fn get_first_station(
        &self,
        workflow_id: Uuid,
    ) -> WorkflowOrchestratorResult<WorkflowStation> {
        let stations = WorkflowStation::find_by_workflow_id(self.pool(), workflow_id).await?;

        stations
            .into_iter()
            .min_by_key(|s| s.position)
            .ok_or(WorkflowOrchestratorError::NoStationConfigured)
    }

    /// Start a workflow execution
    ///
    /// This creates the workflow execution record and starts the first station
    pub async fn start_workflow_execution<C: ContainerService + Sync>(
        &self,
        container_service: &C,
        workflow_id: Uuid,
        task_id: Uuid,
        task_attempt_id: Uuid,
    ) -> WorkflowOrchestratorResult<WorkflowExecution> {
        // Verify workflow exists
        let _workflow = Workflow::find_by_id(self.pool(), workflow_id)
            .await?
            .ok_or(WorkflowOrchestratorError::WorkflowNotFound(workflow_id))?;

        // Get the first station
        let first_station = self.get_first_station(workflow_id).await?;

        // Create workflow execution record
        let workflow_execution_id = Uuid::new_v4();
        let workflow_execution = WorkflowExecution::create(
            self.pool(),
            db::models::workflow_execution::CreateWorkflowExecution {
                workflow_id,
                task_id,
                task_attempt_id: Some(task_attempt_id),
                status: "running".to_string(),
            },
            workflow_execution_id,
        )
        .await?;

        // Update with first station and start time
        let workflow_execution = WorkflowExecution::update(
            self.pool(),
            workflow_execution.id,
            UpdateWorkflowExecution {
                current_station_id: Some(first_station.id),
                started_at: Some(Utc::now()),
                status: None,
                completed_at: None,
            },
        )
        .await?;

        tracing::info!(
            "Started workflow execution {} for workflow {}, starting with station {}",
            workflow_execution.id,
            workflow_id,
            first_station.id
        );

        // Start the first station execution
        self.execute_station(
            container_service,
            workflow_execution.id,
            first_station.id,
            task_attempt_id,
            None,
        )
        .await?;

        Ok(workflow_execution)
    }

    /// Gather context data from previous station executions
    ///
    /// This collects output_data from all completed stations in the workflow execution
    pub async fn gather_context_data(
        &self,
        workflow_execution_id: Uuid,
    ) -> WorkflowOrchestratorResult<JsonValue> {
        let station_executions =
            StationExecution::find_by_workflow_execution(self.pool(), workflow_execution_id)
                .await?;

        let mut context = serde_json::Map::new();

        for station_execution in station_executions {
            if station_execution.status == "completed" {
                if let Some(output_data) = &station_execution.output_data {
                    // Parse output data and merge into context
                    let output: JsonValue = serde_json::from_str(output_data).map_err(|e| {
                        WorkflowOrchestratorError::OutputDataParseError(format!(
                            "Failed to parse station output: {}",
                            e
                        ))
                    })?;

                    if let Some(obj) = output.as_object() {
                        for (key, value) in obj {
                            context.insert(key.clone(), value.clone());
                        }
                    }
                }
            }
        }

        Ok(JsonValue::Object(context))
    }
}

// Integration tests would be added to test the full workflow orchestration
// For now, the code is designed to be testable through the API endpoints
