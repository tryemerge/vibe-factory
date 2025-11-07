//! Workflow Orchestration Service
//!
//! This module provides the core orchestration logic for executing workflow stations sequentially.
//!
//! ## Integration Architecture
//!
//! ### Completion Detection Flow
//!
//! The workflow orchestrator integrates with the existing ExecutionProcess monitoring system:
//!
//! 1. **Station Execution Start** (`execute_station`)
//!    - Creates StationExecution record
//!    - Starts ExecutionProcess via ContainerService
//!    - Links ExecutionProcess to StationExecution
//!
//! 2. **Process Monitoring** (`LocalContainerService::spawn_exit_monitor`)
//!    - Background task polls process for completion
//!    - Detects when ExecutionProcess finishes (success/failure)
//!    - **Integration Point**: After commit/next-action, call `handle_station_completion`
//!
//! 3. **Station Completion** (`handle_station_completion`)
//!    - Updates StationExecution status
//!    - Determines next station via transitions
//!    - Either:
//!      a) Starts next station execution (advances workflow)
//!      b) Completes workflow and moves task to InReview
//!
//! ### Output Data Extraction
//!
//! **Phase 1.1 Approach** (Manual):
//! - Agents are instructed via prompt to provide outputs matching `output_context_keys`
//! - For this phase, output extraction is **manual** - agents must format their outputs
//! - Example prompt: "Please provide the following outputs: design_doc, api_spec"
//! - Agents are expected to output JSON or structured data
//!
//! **Future Enhancement** (Phase 2+):
//! - Automatic extraction from agent work products (files, commits, etc.)
//! - Structured output parsing from agent responses
//! - Tool-based output collection (agent uses tools to register outputs)
//!
//! ### Context Merging Strategy
//!
//! `gather_context_data()` merges outputs from all completed stations:
//! - Later stations **intentionally overwrite** earlier stations if same key
//! - Rationale: Allows stations to refine/update earlier decisions
//! - Alternative: Could namespace by station_id (e.g., "station1_design_doc")
//!   - Current design: Simpler for common case where keys don't conflict
//!   - Can be changed if conflicts become problematic
//!
//! ### Transition Ordering
//!
//! `advance_to_next_station()` evaluates transitions in **database query order**:
//! - **First matching transition wins** (short-circuit evaluation)
//! - No explicit priority field (could be added if needed)
//! - Recommendation: Design workflows with mutually exclusive conditions
//! - For deterministic behavior with multiple matches, use explicit ordering in DB

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
        let prompt = self
            .build_station_prompt(&agent, &station, context_data, workflow_execution_id)
            .await?;

        // Create the station execution record directly as "running"
        let station_execution_id = Uuid::new_v4();
        let station_execution = StationExecution::create(
            self.pool(),
            CreateStationExecution {
                workflow_execution_id,
                station_id,
                status: "running".to_string(),
                execution_process_id: None,
            },
            station_execution_id,
        )
        .await?;

        // Update started_at timestamp
        let station_execution = StationExecution::update(
            self.pool(),
            station_execution.id,
            UpdateStationExecution {
                started_at: Some(Utc::now()),
                status: None,
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
    async fn build_station_prompt(
        &self,
        agent: &Agent,
        station: &WorkflowStation,
        context_data: Option<JsonValue>,
        workflow_execution_id: Uuid,
    ) -> WorkflowOrchestratorResult<String> {
        let mut prompt = agent.system_prompt.clone();

        // Add station-specific instructions
        if let Some(station_prompt) = &station.station_prompt {
            prompt.push_str("\n\n");
            prompt.push_str("## Station Instructions\n");
            prompt.push_str(station_prompt);
        }

        // Add context data if available with better formatting
        if let Some(context) = context_data {
            if let Some(obj) = context.as_object() {
                if !obj.is_empty() {
                    prompt.push_str("\n\n");
                    prompt.push_str("## Context from Previous Stations\n");

                    // Get all completed station executions to show station names
                    let station_executions =
                        StationExecution::find_by_workflow_execution(self.pool(), workflow_execution_id)
                            .await?;

                    // Group outputs by station
                    for station_execution in station_executions {
                        if station_execution.status == "completed" {
                            if let Some(output_data) = &station_execution.output_data {
                                if let Ok(output) = serde_json::from_str::<JsonValue>(output_data) {
                                    if let Some(output_obj) = output.as_object() {
                                        if !output_obj.is_empty() {
                                            // Load station name
                                            if let Ok(Some(station)) = WorkflowStation::find_by_id(
                                                self.pool(),
                                                station_execution.station_id,
                                            )
                                            .await
                                            {
                                                prompt.push_str(&format!("\n### Station: \"{}\"\n", station.name));
                                                for (key, value) in output_obj {
                                                    // Format value nicely
                                                    let formatted_value = match value {
                                                        JsonValue::String(s) => format!("\"{}\"", s),
                                                        JsonValue::Bool(b) => b.to_string(),
                                                        JsonValue::Number(n) => n.to_string(),
                                                        _ => serde_json::to_string_pretty(value)
                                                            .unwrap_or_else(|_| "null".to_string()),
                                                    };
                                                    prompt.push_str(&format!("- {}: {}\n", key, formatted_value));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
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
                prompt.push_str(
                    "Please provide the following outputs in a JSON code block (```json ... ```):\n",
                );
                for key in &output_keys {
                    prompt.push_str(&format!("- {}\n", key));
                }
                prompt.push_str("\nExample format:\n");
                prompt.push_str("```json\n{\n");
                for (i, key) in output_keys.iter().enumerate() {
                    prompt.push_str(&format!("  \"{}\": \"your_value_here\"", key));
                    if i < output_keys.len() - 1 {
                        prompt.push_str(",");
                    }
                    prompt.push_str("\n");
                }
                prompt.push_str("}\n```\n");
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
    pub async fn handle_station_completion<C: ContainerService + Sync>(
        &self,
        container_service: &C,
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

                // Gather context from all completed stations
                let context_data = self.gather_context_data(workflow_execution.id).await?;

                // Get task_attempt_id from workflow execution
                let task_attempt_id = workflow_execution
                    .task_attempt_id
                    .ok_or_else(|| anyhow!("Workflow execution has no task_attempt_id"))?;

                // Start the next station execution with context
                self.execute_station(
                    container_service,
                    workflow_execution.id,
                    next_station_id,
                    task_attempt_id,
                    Some(context_data),
                )
                .await?;

                tracing::info!(
                    "Started next station execution for station {}",
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

    /// Extract output data from agent response text
    ///
    /// This function implements Phase 1.1's manual extraction approach:
    /// - Looks for JSON blocks in markdown (```json ... ```)
    /// - Extracts keys specified in `output_context_keys`
    /// - Returns a JSON object with those keys
    ///
    /// # Arguments
    /// * `response_text` - The full agent response text (from MsgStore or logs)
    /// * `output_context_keys` - Comma-separated list of keys to extract
    ///
    /// # Returns
    /// JSON string containing the extracted key-value pairs, or None if no valid data found
    pub fn extract_output_data(
        &self,
        response_text: &str,
        output_context_keys: Option<&str>,
    ) -> Option<String> {
        let keys_to_extract = match output_context_keys {
            Some(keys) if !keys.trim().is_empty() => {
                keys.split(',').map(|k| k.trim().to_string()).collect::<Vec<_>>()
            }
            _ => return None, // No keys specified
        };

        // Look for JSON code blocks in markdown format
        let json_block_pattern = regex::Regex::new(r"```json\s*([\s\S]*?)\s*```").ok()?;

        // Try each JSON block until we find one that parses successfully
        for captures in json_block_pattern.captures_iter(response_text) {
            if let Some(json_content) = captures.get(1) {
                // Try to parse as JSON
                if let Ok(parsed) = serde_json::from_str::<JsonValue>(json_content.as_str()) {
                    let mut extracted = serde_json::Map::new();

                    // Extract only the specified keys
                    if let Some(obj) = parsed.as_object() {
                        for key in &keys_to_extract {
                            if let Some(value) = obj.get(key) {
                                extracted.insert(key.clone(), value.clone());
                            }
                        }
                    }

                    // If we found any matching keys, return the extracted data
                    if !extracted.is_empty() {
                        if let Ok(json_str) = serde_json::to_string(&JsonValue::Object(extracted)) {
                            return Some(json_str);
                        }
                    }
                }
            }
        }

        // If no JSON blocks found, try parsing the entire response as JSON
        if let Ok(parsed) = serde_json::from_str::<JsonValue>(response_text) {
            let mut extracted = serde_json::Map::new();

            if let Some(obj) = parsed.as_object() {
                for key in &keys_to_extract {
                    if let Some(value) = obj.get(key) {
                        extracted.insert(key.clone(), value.clone());
                    }
                }
            }

            if !extracted.is_empty() {
                if let Ok(json_str) = serde_json::to_string(&JsonValue::Object(extracted)) {
                    return Some(json_str);
                }
            }
        }

        None
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

    /// Check if an execution process is part of a workflow station execution
    ///
    /// This function is called from LocalContainerService::spawn_exit_monitor
    /// to determine if workflow orchestration should be triggered.
    ///
    /// Returns: Option<(StationExecution, bool)> where bool indicates success
    pub async fn check_execution_for_workflow(
        &self,
        execution_process_id: Uuid,
        success: bool,
    ) -> WorkflowOrchestratorResult<Option<(StationExecution, bool)>> {
        // Check if this execution is linked to a station execution
        let station_execution = StationExecution::find_by_execution_process(
            self.pool(),
            execution_process_id,
        )
        .await?;

        Ok(station_execution.map(|se| (se, success)))
    }

    /// Trigger workflow progression after an execution completes
    ///
    /// This is the main integration point called from LocalContainerService::spawn_exit_monitor.
    /// It should be called after commit/next-action logic completes.
    ///
    /// # Arguments
    /// * `container_service` - Container service for starting next station executions
    /// * `execution_process_id` - The completed ExecutionProcess ID
    /// * `success` - Whether the execution succeeded
    /// * `output_data` - Optional JSON output data extracted from the execution
    ///
    /// # Integration Example
    /// ```ignore
    /// // In LocalContainerService::spawn_exit_monitor, after commit/next-action:
    /// if let Ok(Some((station_execution, success))) = workflow_orchestrator
    ///     .check_execution_for_workflow(exec_id, success)
    ///     .await
    /// {
    ///     // Extract output data from execution (Phase 1.1: manual for now)
    ///     let output_data = None; // TODO: Implement output extraction
    ///
    ///     if let Err(e) = workflow_orchestrator
    ///         .handle_station_completion(&container_service, station_execution.id, success, output_data)
    ///         .await
    ///     {
    ///         tracing::error!("Failed to handle workflow station completion: {}", e);
    ///     }
    /// }
    /// ```
    pub async fn trigger_workflow_progression<C: ContainerService + Sync>(
        &self,
        container_service: &C,
        execution_process_id: Uuid,
        success: bool,
        output_data: Option<String>,
    ) -> WorkflowOrchestratorResult<()> {
        // Check if this execution is part of a workflow
        if let Some((station_execution, _)) = self
            .check_execution_for_workflow(execution_process_id, success)
            .await?
        {
            tracing::info!(
                "Execution {} is part of workflow, triggering station completion",
                execution_process_id
            );

            // Handle the station completion and advance workflow
            self.handle_station_completion(container_service, station_execution.id, success, output_data)
                .await?;
        }

        Ok(())
    }
}

// Integration tests would be added to test the full workflow orchestration
// For now, the code is designed to be testable through the API endpoints
