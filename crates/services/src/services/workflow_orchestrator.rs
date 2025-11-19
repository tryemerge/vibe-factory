//! Workflow Orchestration Service
//!
//! This module provides the core orchestration logic for executing workflow stations sequentially,
//! including conditional transition evaluation for dynamic workflow routing.
//!
//! ## Transition Condition Evaluation
//!
//! The orchestrator supports multiple transition types for flexible workflow routing:
//!
//! ### Unconditional Transitions
//! Always follow the transition, regardless of station output:
//! ```text
//! condition_type: "unconditional" (or "always" or null)
//! condition_value: null
//! ```
//!
//! ### Status-Based Transitions
//! Route based on station execution status:
//! - `"success"`: Only transition if station completed successfully
//! - `"failure"`: Only transition if station failed
//!
//! ### Conditional Transitions
//! Evaluate station output_data to determine routing:
//!
//! **Simple key existence check:**
//! ```text
//! condition_type: "conditional"
//! condition_value: "review_passed"
//! → Returns true if output_data contains the key "review_passed"
//! ```
//!
//! **Value comparison:**
//! ```text
//! condition_type: "conditional"
//! condition_value: {"key": "review_passed", "value": true}
//! → Returns true if output_data.review_passed == true
//! ```
//!
//! **Example Workflow:**
//! ```text
//! Station A: Code Review
//!   ├─→ Station B (conditional: review_passed == true)
//!   └─→ Station C (conditional: review_passed == false)
//! ```
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
        execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
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

    #[error("Station execution not found: {0}")]
    StationExecutionNotFound(Uuid),

    #[error("Execution process not found: {0}")]
    ExecutionProcessNotFound(Uuid),

    #[error("Station execution timeout: {station_id} (timeout: {timeout_ms}ms)")]
    StationExecutionTimeout { station_id: Uuid, timeout_ms: u64 },

    #[error("Circular workflow detected: visited stations {0:?}")]
    CircularWorkflow(Vec<Uuid>),

    #[error("Invalid transition condition syntax: {0}")]
    InvalidTransitionSyntax(String),

    #[error("Missing output context keys: expected {expected:?}, got {actual:?}")]
    MissingOutputKeys {
        expected: Vec<String>,
        actual: Vec<String>,
    },

    #[error("Station execution failed: {station_id} - {reason}")]
    StationExecutionFailed { station_id: Uuid, reason: String },

    #[error("Git conflict during execution: {0}")]
    GitConflict(String),

    #[error("Database connection lost during execution")]
    DatabaseConnectionLost,

    #[error("Workflow execution in invalid state: expected {expected}, got {actual}")]
    InvalidWorkflowState { expected: String, actual: String },

    #[error("Cannot resume workflow: {0}")]
    ResumeError(String),

    #[error("Retry limit exceeded for station {station_id}: {attempts} attempts")]
    RetryLimitExceeded { station_id: Uuid, attempts: u32 },

    #[error("Other error: {0}")]
    Other(#[from] anyhow::Error),
}

/// Error context for structured logging and debugging
#[derive(Debug, Clone)]
pub struct ErrorContext {
    pub station_id: Option<Uuid>,
    pub station_execution_id: Option<Uuid>,
    pub workflow_execution_id: Option<Uuid>,
    pub execution_process_id: Option<Uuid>,
    pub error_message: String,
    pub timestamp: chrono::DateTime<Utc>,
}

impl ErrorContext {
    pub fn new(error_message: String) -> Self {
        Self {
            station_id: None,
            station_execution_id: None,
            workflow_execution_id: None,
            execution_process_id: None,
            error_message,
            timestamp: Utc::now(),
        }
    }

    pub fn with_station(mut self, station_id: Uuid) -> Self {
        self.station_id = Some(station_id);
        self
    }

    pub fn with_station_execution(mut self, station_execution_id: Uuid) -> Self {
        self.station_execution_id = Some(station_execution_id);
        self
    }

    pub fn with_workflow_execution(mut self, workflow_execution_id: Uuid) -> Self {
        self.workflow_execution_id = Some(workflow_execution_id);
        self
    }

    pub fn with_execution_process(mut self, execution_process_id: Uuid) -> Self {
        self.execution_process_id = Some(execution_process_id);
        self
    }

    /// Log this error context with structured fields
    pub fn log_error(&self) {
        tracing::error!(
            station_id = ?self.station_id,
            station_execution_id = ?self.station_execution_id,
            workflow_execution_id = ?self.workflow_execution_id,
            execution_process_id = ?self.execution_process_id,
            timestamp = %self.timestamp,
            "Workflow orchestration error: {}",
            self.error_message
        );
    }
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
    /// 3. Detects circular workflows
    /// 4. Returns the next station or None if workflow is complete
    pub async fn advance_to_next_station(
        &self,
        workflow_execution_id: Uuid,
        current_station_id: Uuid,
        station_execution: &StationExecution,
    ) -> WorkflowOrchestratorResult<Option<Uuid>> {
        // Get all transitions from the current station
        let transitions =
            StationTransition::find_by_source_station(self.pool(), current_station_id).await?;

        if transitions.is_empty() {
            tracing::info!(
                workflow_execution_id = ?workflow_execution_id,
                current_station_id = ?current_station_id,
                "No transitions found from station, workflow complete"
            );
            return Ok(None);
        }

        // Evaluate transitions to find the next station
        for transition in transitions {
            // Validate transition condition syntax first
            Self::validate_transition_condition(
                transition.condition_type.as_deref(),
                transition.condition_value.as_deref(),
            )?;

            if self.evaluate_transition(&transition, station_execution).await? {
                let next_station_id = transition.target_station_id;

                tracing::info!(
                    workflow_execution_id = ?workflow_execution_id,
                    transition_id = ?transition.id,
                    current_station_id = ?current_station_id,
                    next_station_id = ?next_station_id,
                    condition_type = ?transition.condition_type,
                    "Transition matched, moving to next station"
                );

                // Detect circular workflows before advancing
                self.detect_circular_workflow(workflow_execution_id, next_station_id).await?;

                return Ok(Some(next_station_id));
            }
        }

        // No valid transition found
        let error_ctx = ErrorContext::new(format!(
            "No valid transition found from station {}",
            current_station_id
        ))
        .with_station(current_station_id)
        .with_workflow_execution(workflow_execution_id)
        .with_station_execution(station_execution.id);

        error_ctx.log_error();

        Err(WorkflowOrchestratorError::NoValidTransition(
            current_station_id,
        ))
    }

    /// Public helper function to evaluate a transition condition
    ///
    /// This is a convenience function that can be used for testing or external evaluation
    /// of transition conditions without requiring a full workflow context.
    ///
    /// # Arguments
    /// * `transition` - The StationTransition to evaluate
    /// * `station_execution` - The StationExecution with output_data to evaluate against
    ///
    /// # Returns
    /// * `Ok(true)` - The transition should be taken
    /// * `Ok(false)` - The transition should not be taken
    /// * `Err(...)` - Evaluation failed (invalid condition format, etc.)
    ///
    /// # Example
    /// ```rust,ignore
    /// use workflow_orchestrator::WorkflowOrchestrator;
    /// use db::models::station_transition::StationTransition;
    /// use db::models::station_execution::StationExecution;
    ///
    /// let orchestrator = WorkflowOrchestrator::new(db_service);
    ///
    /// // Evaluate a conditional transition
    /// let should_take = orchestrator.evaluate_transition_condition(
    ///     &transition,
    ///     &station_execution
    /// ).await?;
    ///
    /// if should_take {
    ///     // Take the transition...
    /// }
    /// ```
    pub async fn evaluate_transition_condition(
        &self,
        transition: &StationTransition,
        station_execution: &StationExecution,
    ) -> WorkflowOrchestratorResult<bool> {
        self.evaluate_transition(transition, station_execution)
            .await
    }

    /// Evaluate whether a transition should be taken
    ///
    /// # Condition Types
    ///
    /// ## Unconditional Transitions
    ///
    /// **`unconditional`** or **`always`** or **`None`**: Always follow this transition
    /// ```rust
    /// // Example: Transition A -> B (always happens)
    /// StationTransition {
    ///     condition_type: Some("unconditional"),
    ///     condition_value: None,
    ///     // ...
    /// }
    /// ```
    ///
    /// ## Status-Based Transitions
    ///
    /// **`success`**: Only transition if station succeeded (status == "completed")
    /// ```rust
    /// StationTransition {
    ///     condition_type: Some("success"),
    ///     condition_value: None,
    ///     // ...
    /// }
    /// ```
    ///
    /// **`failure`**: Only transition if station failed (status == "failed")
    /// ```rust
    /// StationTransition {
    ///     condition_type: Some("failure"),
    ///     condition_value: None,
    ///     // ...
    /// }
    /// ```
    ///
    /// ## Conditional Transitions
    ///
    /// **`conditional`**: Evaluate condition_value against station output_data
    ///
    /// ### Example 1: Key Existence
    /// ```rust
    /// // Transition if output contains "review_passed" key
    /// StationTransition {
    ///     condition_type: Some("conditional"),
    ///     condition_value: Some("review_passed"),
    ///     // ...
    /// }
    /// ```
    ///
    /// ### Example 2: Value Comparison
    /// ```rust
    /// // Transition if output.review_passed == true
    /// StationTransition {
    ///     condition_type: Some("conditional"),
    ///     condition_value: Some(r#"{"key": "review_passed", "value": true}"#),
    ///     // ...
    /// }
    /// ```
    ///
    /// # Returns
    /// - `Ok(true)` if the transition should be taken
    /// - `Ok(false)` if the transition should not be taken
    /// - `Err(...)` if evaluation fails
    async fn evaluate_transition(
        &self,
        transition: &StationTransition,
        station_execution: &StationExecution,
    ) -> WorkflowOrchestratorResult<bool> {
        // Check condition_type
        match transition.condition_type.as_deref() {
            Some("unconditional") | Some("always") | None => {
                // Always transition (default behavior)
                tracing::debug!(
                    "Transition {} is unconditional, always taking it",
                    transition.id
                );
                Ok(true)
            }
            Some("success") => {
                // Only transition if station succeeded
                let should_transition = station_execution.status == "completed";
                tracing::debug!(
                    "Transition {} requires success, station status is '{}', result: {}",
                    transition.id,
                    station_execution.status,
                    should_transition
                );
                Ok(should_transition)
            }
            Some("failure") => {
                // Only transition if station failed
                let should_transition = station_execution.status == "failed";
                tracing::debug!(
                    "Transition {} requires failure, station status is '{}', result: {}",
                    transition.id,
                    station_execution.status,
                    should_transition
                );
                Ok(should_transition)
            }
            Some("conditional") => {
                // Evaluate condition_value expression
                if let Some(condition_value) = &transition.condition_value {
                    tracing::debug!(
                        "Evaluating conditional transition {} with condition: {}",
                        transition.id,
                        condition_value
                    );
                    let result = self
                        .evaluate_condition_expression(condition_value, station_execution)
                        .await?;
                    tracing::debug!(
                        "Conditional transition {} evaluation result: {}",
                        transition.id,
                        result
                    );
                    Ok(result)
                } else {
                    tracing::warn!(
                        "Transition {} is conditional but has no condition_value, defaulting to false",
                        transition.id
                    );
                    Ok(false)
                }
            }
            Some(unknown) => {
                tracing::warn!(
                    "Unknown condition_type '{}' for transition {}, defaulting to false",
                    unknown,
                    transition.id
                );
                Ok(false)
            }
        }
    }

    /// Evaluate a conditional expression
    ///
    /// Supports multiple evaluation strategies:
    /// 1. Simple key existence check
    /// 2. Key-value comparison
    /// 3. Legacy format (check_output_key + expected_value)
    ///
    /// # Condition Format Examples
    ///
    /// **Key Existence Check:**
    /// ```json
    /// "review_passed"
    /// ```
    /// Returns true if `output_data` contains a key "review_passed"
    ///
    /// **Key-Value Comparison (String):**
    /// ```json
    /// {"key": "review_passed", "value": "true"}
    /// ```
    /// Returns true if `output_data.review_passed == "true"`
    ///
    /// **Key-Value Comparison (Boolean):**
    /// ```json
    /// {"key": "tests_passed", "value": true}
    /// ```
    /// Returns true if `output_data.tests_passed == true`
    ///
    /// **Legacy Format (Deprecated):**
    /// ```json
    /// {"check_output_key": "review_passed", "expected_value": "true"}
    /// ```
    ///
    /// # Error Handling
    /// - Returns error if output_data cannot be parsed
    /// - Returns error if condition_value has invalid syntax
    /// - Logs warnings for missing keys (returns false, not error)
    async fn evaluate_condition_expression(
        &self,
        condition_value: &str,
        station_execution: &StationExecution,
    ) -> WorkflowOrchestratorResult<bool> {
        // Parse station output_data (if available)
        let output = if let Some(output_data) = &station_execution.output_data {
            serde_json::from_str::<JsonValue>(output_data).map_err(|e| {
                WorkflowOrchestratorError::OutputDataParseError(format!(
                    "Failed to parse station output data: {}",
                    e
                ))
            })?
        } else {
            // No output data, condition cannot be satisfied
            return Ok(false);
        };

        // Try parsing condition_value as JSON
        let condition_result = serde_json::from_str::<JsonValue>(condition_value);

        match condition_result {
            Ok(JsonValue::String(key)) => {
                // Simple key existence check
                // Example: condition_value = "review_passed"
                // Returns true if output contains the key "review_passed"
                Ok(output.get(&key).is_some())
            }
            Ok(JsonValue::Object(condition_obj)) => {
                // Object-based evaluation

                // Modern format: {"key": "...", "value": ...}
                if let (Some(key), Some(expected_value)) = (
                    condition_obj.get("key").and_then(|v| v.as_str()),
                    condition_obj.get("value"),
                ) {
                    if let Some(actual_value) = output.get(key) {
                        return Ok(actual_value == expected_value);
                    } else {
                        // Key doesn't exist in output
                        return Ok(false);
                    }
                }

                // Legacy format: {"check_output_key": "...", "expected_value": ...}
                if let (Some(check_key), Some(expected_value)) = (
                    condition_obj.get("check_output_key").and_then(|v| v.as_str()),
                    condition_obj.get("expected_value"),
                ) {
                    if let Some(actual_value) = output.get(check_key) {
                        return Ok(actual_value == expected_value);
                    } else {
                        return Ok(false);
                    }
                }

                // Unknown object format
                Err(WorkflowOrchestratorError::TransitionEvaluationError(
                    format!("Unsupported condition object format. Expected {{\"key\": \"...\", \"value\": ...}} or {{\"check_output_key\": \"...\", \"expected_value\": ...}}, got: {}", condition_value)
                ))
            }
            Ok(_) => {
                // Other JSON types (array, number, boolean, null) are not supported
                Err(WorkflowOrchestratorError::TransitionEvaluationError(
                    format!("Unsupported condition type. Expected string (key name) or object, got: {}", condition_value)
                ))
            }
            Err(_) => {
                // Not valid JSON - try treating as plain string key name
                // Example: condition_value = "review_passed" (without quotes)
                Ok(output.get(condition_value).is_some())
            }
        }
    }

    /// Handle station completion
    ///
    /// This function:
    /// 1. Updates station_execution status
    /// 2. Checks if station succeeded/failed
    /// 3. Advances to next station or completes workflow
    /// 4. Moves task to "inreview" when all stations complete
    /// 5. Handles errors with structured logging and recovery
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
            .ok_or(WorkflowOrchestratorError::StationExecutionNotFound(
                station_execution_id
            ))?;

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
            station_id = ?station_execution.station_id,
            station_execution_id = ?station_execution_id,
            workflow_execution_id = ?station_execution.workflow_execution_id,
            status = status,
            "Station execution completed"
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
            let error_ctx = ErrorContext::new(format!("Station execution failed: {}", status))
                .with_station(station_execution.station_id)
                .with_station_execution(station_execution_id)
                .with_workflow_execution(workflow_execution.id);

            error_ctx.log_error();

            tracing::warn!(
                station_execution_id = ?station_execution_id,
                workflow_execution_id = ?workflow_execution.id,
                "Station execution failed, marking workflow as failed"
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

                // Check if this is a terminator station - if so, trigger PR creation
                let current_station = WorkflowStation::find_by_id(self.pool(), station_execution.station_id)
                    .await?
                    .ok_or(WorkflowOrchestratorError::StationNotFound(station_execution.station_id))?;

                if current_station.is_terminator {
                    tracing::info!(
                        "Workflow execution {} reached terminator station {}, will trigger PR creation",
                        workflow_execution.id,
                        current_station.id
                    );
                    // Note: PR creation will be handled by terminator_handler in the next phase
                    // For now, we just mark the task as InReview
                }

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

    /// Resume a workflow execution from its last checkpoint (current_station_id)
    ///
    /// This function allows recovering from system failures by restarting execution
    /// from the current station. It handles the following recovery scenarios:
    /// - Process crash/restart
    /// - Database connection lost during execution
    /// - System shutdown during workflow execution
    ///
    /// # Arguments
    /// * `container_service` - Container service for starting station executions
    /// * `workflow_execution_id` - The workflow execution to resume
    ///
    /// # Recovery Logic
    /// 1. Validate workflow execution exists and is in "running" state
    /// 2. Check if current_station_id is set (indicates checkpoint)
    /// 3. Find the station execution for the current station
    /// 4. If station execution is "running" but process is dead, restart it
    /// 5. If station execution is "completed", advance to next station
    /// 6. If no valid checkpoint, fail with error
    pub async fn resume_workflow_execution<C: ContainerService + Sync>(
        &self,
        container_service: &C,
        workflow_execution_id: Uuid,
    ) -> WorkflowOrchestratorResult<()> {
        tracing::info!(
            workflow_execution_id = ?workflow_execution_id,
            "Attempting to resume workflow execution"
        );

        // Load workflow execution
        let workflow_execution = WorkflowExecution::find_by_id(self.pool(), workflow_execution_id)
            .await?
            .ok_or(WorkflowOrchestratorError::WorkflowExecutionNotFound(
                workflow_execution_id,
            ))?;

        // Validate state
        if workflow_execution.status != "running" {
            return Err(WorkflowOrchestratorError::InvalidWorkflowState {
                expected: "running".to_string(),
                actual: workflow_execution.status.clone(),
            });
        }

        // Get current station from checkpoint
        let current_station_id = workflow_execution
            .current_station_id
            .ok_or_else(|| WorkflowOrchestratorError::ResumeError(
                "No current station checkpoint found".to_string()
            ))?;

        tracing::info!(
            workflow_execution_id = ?workflow_execution_id,
            current_station_id = ?current_station_id,
            "Found checkpoint at station"
        );

        // Find station executions for this workflow and current station
        let station_executions =
            StationExecution::find_by_workflow_execution(self.pool(), workflow_execution_id).await?;

        let current_station_exec = station_executions
            .iter()
            .find(|se| se.station_id == current_station_id)
            .ok_or_else(|| WorkflowOrchestratorError::ResumeError(
                format!("No station execution found for current station {}", current_station_id)
            ))?;

        match current_station_exec.status.as_str() {
            "running" => {
                // Station was running when interrupted - check if process is still alive
                if let Some(exec_process_id) = current_station_exec.execution_process_id {
                    let exec_process = ExecutionProcess::find_by_id(self.pool(), exec_process_id)
                        .await?
                        .ok_or(WorkflowOrchestratorError::ExecutionProcessNotFound(exec_process_id))?;

                    if exec_process.status != ExecutionProcessStatus::Running {
                        tracing::warn!(
                            station_execution_id = ?current_station_exec.id,
                            execution_process_id = ?exec_process_id,
                            process_status = ?exec_process.status,
                            "Process is not running, restarting station execution"
                        );

                        // Restart the station execution
                        return self.retry_station_execution(
                            container_service,
                            workflow_execution_id,
                            current_station_id,
                            workflow_execution.task_attempt_id.ok_or_else(|| {
                                anyhow!("Workflow execution has no task_attempt_id")
                            })?,
                        ).await;
                    } else {
                        tracing::info!(
                            station_execution_id = ?current_station_exec.id,
                            execution_process_id = ?exec_process_id,
                            "Process is still running, no action needed"
                        );
                    }
                } else {
                    tracing::warn!(
                        station_execution_id = ?current_station_exec.id,
                        "Station execution is running but has no execution_process_id, restarting"
                    );

                    // Restart the station execution
                    return self.retry_station_execution(
                        container_service,
                        workflow_execution_id,
                        current_station_id,
                        workflow_execution.task_attempt_id.ok_or_else(|| {
                            anyhow!("Workflow execution has no task_attempt_id")
                        })?,
                    ).await;
                }
            }
            "completed" => {
                tracing::info!(
                    station_execution_id = ?current_station_exec.id,
                    "Current station is completed, advancing to next station"
                );

                // Gather context from all completed stations
                let context_data = self.gather_context_data(workflow_execution_id).await?;

                // Try to advance to next station
                let next_station_id = self
                    .advance_to_next_station(
                        workflow_execution_id,
                        current_station_id,
                        current_station_exec,
                    )
                    .await?;

                if let Some(next_station_id) = next_station_id {
                    // Update workflow execution with next station
                    WorkflowExecution::update(
                        self.pool(),
                        workflow_execution_id,
                        UpdateWorkflowExecution {
                            current_station_id: Some(next_station_id),
                            status: None,
                            started_at: None,
                            completed_at: None,
                        },
                    )
                    .await?;

                    // Start the next station
                    let task_attempt_id = workflow_execution
                        .task_attempt_id
                        .ok_or_else(|| anyhow!("Workflow execution has no task_attempt_id"))?;

                    self.execute_station(
                        container_service,
                        workflow_execution_id,
                        next_station_id,
                        task_attempt_id,
                        Some(context_data),
                    )
                    .await?;
                } else {
                    // Workflow is complete
                    WorkflowExecution::update(
                        self.pool(),
                        workflow_execution_id,
                        UpdateWorkflowExecution {
                            status: Some("completed".to_string()),
                            completed_at: Some(Utc::now()),
                            current_station_id: None,
                            started_at: None,
                        },
                    )
                    .await?;

                    Task::update_status(self.pool(), workflow_execution.task_id, TaskStatus::InReview)
                        .await?;
                }
            }
            "failed" => {
                return Err(WorkflowOrchestratorError::ResumeError(
                    format!("Cannot resume from failed station execution {}", current_station_exec.id)
                ));
            }
            _ => {
                return Err(WorkflowOrchestratorError::ResumeError(
                    format!("Unknown station execution status: {}", current_station_exec.status)
                ));
            }
        }

        Ok(())
    }

    /// Retry a station execution from a checkpoint
    ///
    /// This function allows retrying a failed or interrupted station execution.
    /// It's useful for handling transient failures like network issues or timeout.
    ///
    /// # Arguments
    /// * `container_service` - Container service for starting station executions
    /// * `workflow_execution_id` - The workflow execution
    /// * `station_id` - The station to retry
    /// * `task_attempt_id` - The task attempt ID
    pub async fn retry_station_execution<C: ContainerService + Sync>(
        &self,
        container_service: &C,
        workflow_execution_id: Uuid,
        station_id: Uuid,
        task_attempt_id: Uuid,
    ) -> WorkflowOrchestratorResult<()> {
        tracing::info!(
            workflow_execution_id = ?workflow_execution_id,
            station_id = ?station_id,
            "Retrying station execution"
        );

        // Gather context from previously completed stations
        let context_data = self.gather_context_data(workflow_execution_id).await?;

        // Create a new station execution (the old one stays as "failed" or "running" for audit)
        self.execute_station(
            container_service,
            workflow_execution_id,
            station_id,
            task_attempt_id,
            Some(context_data),
        )
        .await?;

        Ok(())
    }

    /// Detect circular workflows by tracking visited stations
    ///
    /// This function prevents infinite loops by detecting when a workflow
    /// would transition back to a station that has already been visited.
    ///
    /// # Arguments
    /// * `workflow_execution_id` - The workflow execution to check
    /// * `next_station_id` - The next station we're about to visit
    ///
    /// # Returns
    /// * `Ok(())` if no circular reference detected
    /// * `Err(CircularWorkflow)` if the station has already been visited
    pub async fn detect_circular_workflow(
        &self,
        workflow_execution_id: Uuid,
        next_station_id: Uuid,
    ) -> WorkflowOrchestratorResult<()> {
        // Get all station executions for this workflow
        let station_executions =
            StationExecution::find_by_workflow_execution(self.pool(), workflow_execution_id).await?;

        // Extract visited station IDs
        let visited_stations: Vec<Uuid> = station_executions
            .iter()
            .map(|se| se.station_id)
            .collect();

        // Check if next station has already been visited
        if visited_stations.contains(&next_station_id) {
            tracing::error!(
                workflow_execution_id = ?workflow_execution_id,
                next_station_id = ?next_station_id,
                visited_stations = ?visited_stations,
                "Circular workflow detected"
            );

            return Err(WorkflowOrchestratorError::CircularWorkflow(visited_stations));
        }

        Ok(())
    }

    /// Validate transition condition syntax
    ///
    /// This function validates that a transition condition is well-formed
    /// before attempting to evaluate it. This prevents cryptic runtime errors.
    fn validate_transition_condition(
        condition_type: Option<&str>,
        condition_value: Option<&str>,
    ) -> WorkflowOrchestratorResult<()> {
        match condition_type {
            Some("conditional") => {
                if let Some(value) = condition_value {
                    // Try parsing as JSON to validate syntax
                    if value.starts_with('{') {
                        serde_json::from_str::<JsonValue>(value).map_err(|e| {
                            WorkflowOrchestratorError::InvalidTransitionSyntax(format!(
                                "Invalid JSON in condition_value: {}",
                                e
                            ))
                        })?;
                    }
                    Ok(())
                } else {
                    Err(WorkflowOrchestratorError::InvalidTransitionSyntax(
                        "Conditional transition requires condition_value".to_string(),
                    ))
                }
            }
            Some("success") | Some("failure") | Some("unconditional") | Some("always") | None => {
                Ok(())
            }
            Some(unknown) => Err(WorkflowOrchestratorError::InvalidTransitionSyntax(
                format!("Unknown condition_type: {}", unknown),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    /// Test helper to create a station execution with output data
    fn create_test_station_execution(
        output_data: Option<&str>,
        status: &str,
    ) -> StationExecution {
        StationExecution {
            id: Uuid::new_v4(),
            workflow_execution_id: Uuid::new_v4(),
            station_id: Uuid::new_v4(),
            execution_process_id: None,
            status: status.to_string(),
            output_data: output_data.map(|s| s.to_string()),
            started_at: None,
            completed_at: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    /// Test helper to create a station transition
    fn create_test_transition(
        condition_type: Option<&str>,
        condition_value: Option<&str>,
    ) -> StationTransition {
        StationTransition {
            id: Uuid::new_v4(),
            workflow_id: Uuid::new_v4(),
            source_station_id: Uuid::new_v4(),
            target_station_id: Uuid::new_v4(),
            condition: None,
            label: None,
            condition_type: condition_type.map(|s| s.to_string()),
            condition_value: condition_value.map(|s| s.to_string()),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn test_evaluate_condition_key_existence() {
        // Test simple key existence check
        let output_data = r#"{"review_passed": true, "tests_run": 42}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        // Create a minimal orchestrator (we don't need a real DB for this test)
        // Note: This test focuses on the logic, not DB operations
        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        let db = DBService { pool };
        let orchestrator = WorkflowOrchestrator::new(db);

        let result = orchestrator
            .evaluate_condition_expression("review_passed", &station_execution)
            .await
            .unwrap();

        assert!(result, "Should return true when key exists");
    }

    #[tokio::test]
    async fn test_evaluate_condition_key_not_exists() {
        let output_data = r#"{"review_passed": true}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        let db = DBService { pool };
        let orchestrator = WorkflowOrchestrator::new(db);

        let result = orchestrator
            .evaluate_condition_expression("nonexistent_key", &station_execution)
            .await
            .unwrap();

        assert!(!result, "Should return false when key doesn't exist");
    }

    #[tokio::test]
    async fn test_evaluate_condition_value_comparison_true() {
        let output_data = r#"{"review_passed": true}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        let db = DBService { pool };
        let orchestrator = WorkflowOrchestrator::new(db);

        let condition = r#"{"key": "review_passed", "value": true}"#;
        let result = orchestrator
            .evaluate_condition_expression(condition, &station_execution)
            .await
            .unwrap();

        assert!(result, "Should return true when values match");
    }

    #[tokio::test]
    async fn test_evaluate_condition_value_comparison_false() {
        let output_data = r#"{"review_passed": true}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        let db = DBService { pool };
        let orchestrator = WorkflowOrchestrator::new(db);

        let condition = r#"{"key": "review_passed", "value": false}"#;
        let result = orchestrator
            .evaluate_condition_expression(condition, &station_execution)
            .await
            .unwrap();

        assert!(!result, "Should return false when values don't match");
    }

    #[tokio::test]
    async fn test_evaluate_condition_string_value() {
        let output_data = r#"{"status": "approved", "reviewer": "alice"}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        let db = DBService { pool };
        let orchestrator = WorkflowOrchestrator::new(db);

        let condition = r#"{"key": "status", "value": "approved"}"#;
        let result = orchestrator
            .evaluate_condition_expression(condition, &station_execution)
            .await
            .unwrap();

        assert!(result, "Should return true when string values match");
    }

    #[tokio::test]
    async fn test_transition_unconditional() {
        let station_execution = create_test_station_execution(None, "completed");
        let transition = create_test_transition(Some("unconditional"), None);

        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        let db = DBService { pool };
        let orchestrator = WorkflowOrchestrator::new(db);

        let result = orchestrator
            .evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(result, "Unconditional transition should always be true");
    }

    #[tokio::test]
    async fn test_transition_success() {
        let station_execution = create_test_station_execution(None, "completed");
        let transition = create_test_transition(Some("success"), None);

        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        let db = DBService { pool };
        let orchestrator = WorkflowOrchestrator::new(db);

        let result = orchestrator
            .evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(result, "Success transition should be true for completed status");
    }

    #[tokio::test]
    async fn test_transition_failure() {
        let station_execution = create_test_station_execution(None, "failed");
        let transition = create_test_transition(Some("failure"), None);

        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        let db = DBService { pool };
        let orchestrator = WorkflowOrchestrator::new(db);

        let result = orchestrator
            .evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(result, "Failure transition should be true for failed status");
    }

    #[tokio::test]
    async fn test_no_output_data_returns_false() {
        // When there's no output data, conditional transitions should return false
        let station_execution = create_test_station_execution(None, "completed");

        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        let db = DBService { pool };
        let orchestrator = WorkflowOrchestrator::new(db);

        let result = orchestrator
            .evaluate_condition_expression("any_key", &station_execution)
            .await
            .unwrap();

        assert!(
            !result,
            "Should return false when there's no output data"
        );
    }

    // NOTE: Circular workflow detection test is in the integration tests
    // because it requires a full database setup with foreign keys

    #[test]
    fn test_validate_transition_condition() {
        use super::WorkflowOrchestrator;

        // Valid conditions
        assert!(WorkflowOrchestrator::validate_transition_condition(Some("success"), None).is_ok());
        assert!(WorkflowOrchestrator::validate_transition_condition(Some("failure"), None).is_ok());
        assert!(WorkflowOrchestrator::validate_transition_condition(Some("unconditional"), None).is_ok());
        assert!(WorkflowOrchestrator::validate_transition_condition(None, None).is_ok());

        // Valid conditional
        assert!(WorkflowOrchestrator::validate_transition_condition(
            Some("conditional"),
            Some(r#"{"key": "test", "value": true}"#)
        ).is_ok());

        // Invalid: conditional without condition_value
        assert!(WorkflowOrchestrator::validate_transition_condition(Some("conditional"), None).is_err());

        // Invalid: conditional with malformed JSON
        assert!(WorkflowOrchestrator::validate_transition_condition(
            Some("conditional"),
            Some(r#"{"key": "test", broken"#)
        ).is_err());

        // Invalid: unknown condition_type
        assert!(WorkflowOrchestrator::validate_transition_condition(Some("unknown"), None).is_err());
    }

    #[test]
    fn test_error_context_builder() {
        let station_id = Uuid::new_v4();
        let station_execution_id = Uuid::new_v4();
        let workflow_execution_id = Uuid::new_v4();
        let execution_process_id = Uuid::new_v4();

        let error_ctx = ErrorContext::new("Test error".to_string())
            .with_station(station_id)
            .with_station_execution(station_execution_id)
            .with_workflow_execution(workflow_execution_id)
            .with_execution_process(execution_process_id);

        assert_eq!(error_ctx.error_message, "Test error");
        assert_eq!(error_ctx.station_id, Some(station_id));
        assert_eq!(error_ctx.station_execution_id, Some(station_execution_id));
        assert_eq!(error_ctx.workflow_execution_id, Some(workflow_execution_id));
        assert_eq!(error_ctx.execution_process_id, Some(execution_process_id));
    }
}
