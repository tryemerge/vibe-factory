//! Transition Evaluator Service
//!
//! This module provides a standalone service for evaluating workflow station transitions.
//! It determines which station should execute next based on transition conditions and current
//! station execution status.
//!
//! ## Transition Types
//!
//! The evaluator supports four main transition types:
//!
//! ### 1. Unconditional Transitions (`always`)
//! Always take the transition, regardless of station outcome.
//! ```text
//! condition_type: "always" (or "unconditional" or null)
//! condition_value: null
//! ```
//!
//! ### 2. Success Transitions (`success`)
//! Only transition if station completed successfully (status == "completed").
//! ```text
//! condition_type: "success"
//! condition_value: null
//! ```
//!
//! ### 3. Failure Transitions (`failure`)
//! Only transition if station failed (status == "failed").
//! ```text
//! condition_type: "failure"
//! condition_value: null
//! ```
//!
//! ### 4. Conditional Transitions (`conditional`)
//! Evaluate custom expression against station output_data.
//!
//! **Key Existence Check:**
//! ```text
//! condition_type: "conditional"
//! condition_value: "review_passed"
//! → Returns true if output_data contains "review_passed" key
//! ```
//!
//! **Key-Value Comparison:**
//! ```text
//! condition_type: "conditional"
//! condition_value: {"key": "review_passed", "value": true}
//! → Returns true if output_data.review_passed == true
//! ```
//!
//! ## Evaluation Algorithm
//!
//! The `evaluate_next_station` method:
//! 1. Fetches all transitions from the current station (ordered by created_at)
//! 2. Evaluates each transition in order (first match wins)
//! 3. Returns the target_station_id of the first matching transition
//! 4. Returns None if no transitions exist (workflow complete)
//! 5. Returns error if no transitions match (workflow stuck)
//!
//! ## ⚠️ Important Limitations
//!
//! ### Context Accumulation
//!
//! **Current behavior:** Conditional expressions only evaluate against the **current station's**
//! `output_data`. They cannot access outputs from previous stations in the workflow.
//!
//! **Example limitation:**
//! ```text
//! Station A outputs: {"design_approved": true}
//! Station B outputs: {"code_complete": true}
//!
//! At Station C, you CANNOT evaluate:
//! condition_value: {"key": "design_approved", "value": true}
//! → This will return false because "design_approved" is not in Station C's output
//! ```
//!
//! **Workaround:** Context accumulation is handled by `WorkflowOrchestrator::gather_context_data()`
//! before executing each station. The orchestrator merges outputs from all previous stations and
//! passes them to the agent prompt. Agents can then include relevant context in their own
//! `output_data` for downstream transitions.
//!
//! **Future enhancement:** Add `evaluate_with_context()` method that accepts merged context data.
//!
//! ### Circular Workflow Detection
//!
//! **Current behavior:** The `detect_circular_workflow()` method **prevents all loops**,
//! including intentional retry workflows.
//!
//! **Example limitation:**
//! ```text
//! Station A (Code Review) → Station B (Fix Issues, on failure) → Station A (retry review)
//! → This will error with CircularWorkflow when trying to return to Station A
//! ```
//!
//! **Impact:** Users designing retry workflows will hit this error unexpectedly.
//!
//! **Workaround:** Currently, retry logic must be implemented at a higher level (e.g., retry
//! entire workflow execution) rather than within the workflow graph.
//!
//! **Future enhancement (documented in Phase 2.3):** Add `allow_revisit` and `max_retries`
//! flags to transitions:
//! ```rust
//! if visited_stations.contains(&next_station_id) {
//!     if !transition.allow_revisit.unwrap_or(false) {
//!         return Err(CircularWorkflow);
//!     }
//!
//!     let retry_count = visited_stations.iter()
//!         .filter(|id| *id == &next_station_id)
//!         .count();
//!     if retry_count >= transition.max_retries.unwrap_or(3) {
//!         return Err(RetryLimitExceeded);
//!     }
//! }
//! ```
//!
//! ### Unknown Condition Types
//!
//! **Current behavior:** Unknown `condition_type` values (e.g., typo like `"succes"` instead
//! of `"success"`) are caught by validation and return `InvalidTransitionSyntax` error.
//!
//! **Best practice:** Validate transitions when creating them (API layer) to catch errors
//! before workflows run. This provides better UX with immediate feedback.
//!
//! **Recommendation:** Add validation to transition creation API:
//! ```rust
//! POST /api/workflows/{id}/transitions
//! → Validate condition_type and condition_value
//! → Return 400 Bad Request if invalid
//! ```
//!
//! ## Error Handling
//!
//! - `NoValidTransition`: No transitions matched the current state
//! - `InvalidTransitionSyntax`: Malformed condition_value or unknown condition_type
//! - `OutputDataParseError`: Station output_data is not valid JSON
//! - `TransitionEvaluationError`: Condition expression evaluation failed
//! - `CircularWorkflow`: Station was already visited (prevents infinite loops)

use anyhow::Result;
use db::models::{
    station_execution::StationExecution,
    station_transition::StationTransition,
};
use serde_json::Value as JsonValue;
use sqlx::SqlitePool;
use uuid::Uuid;

/// Errors that can occur during transition evaluation
#[derive(Debug, thiserror::Error)]
pub enum TransitionEvaluatorError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("No valid transition found from station {0}")]
    NoValidTransition(Uuid),

    #[error("Invalid transition condition syntax: {0}")]
    InvalidTransitionSyntax(String),

    #[error("Failed to parse station output data: {0}")]
    OutputDataParseError(String),

    #[error("Failed to evaluate transition condition: {0}")]
    TransitionEvaluationError(String),

    #[error("Circular workflow detected: visited stations {0:?}")]
    CircularWorkflow(Vec<Uuid>),
}

/// Result type for transition evaluator operations
pub type TransitionEvaluatorResult<T> = Result<T, TransitionEvaluatorError>;

/// Transition evaluator service
///
/// This service encapsulates the logic for determining which station to execute next
/// in a workflow based on transition conditions.
pub struct TransitionEvaluator;

impl TransitionEvaluator {
    /// Evaluate transitions from current station and return next station ID
    ///
    /// # Arguments
    /// * `pool` - Database connection pool
    /// * `workflow_id` - The workflow containing the stations and transitions
    /// * `current_station_id` - The station that just completed
    /// * `station_execution` - The execution record with status and output_data
    ///
    /// # Returns
    /// * `Ok(Some(station_id))` - The next station to execute
    /// * `Ok(None)` - No transitions found (workflow is complete)
    /// * `Err(NoValidTransition)` - Transitions exist but none matched (workflow stuck)
    /// * `Err(...)` - Validation or evaluation error
    ///
    /// # Example
    /// ```ignore
    /// let next_station_id = TransitionEvaluator::evaluate_next_station(
    ///     &pool,
    ///     workflow_id,
    ///     current_station_id,
    ///     &station_execution
    /// ).await?;
    ///
    /// match next_station_id {
    ///     Some(id) => println!("Next station: {}", id),
    ///     None => println!("Workflow complete"),
    /// }
    /// ```
    pub async fn evaluate_next_station(
        pool: &SqlitePool,
        _workflow_id: Uuid,
        current_station_id: Uuid,
        station_execution: &StationExecution,
    ) -> TransitionEvaluatorResult<Option<Uuid>> {
        // 1. Fetch all outgoing transitions from current station
        let transitions =
            StationTransition::find_by_source_station(pool, current_station_id).await?;

        // 2. If no transitions, workflow is complete
        if transitions.is_empty() {
            tracing::info!(
                current_station_id = ?current_station_id,
                "No transitions found from station, workflow complete"
            );
            return Ok(None);
        }

        // 3. Evaluate each transition in order (first match wins)
        for transition in transitions {
            // Validate transition syntax before evaluation
            Self::validate_transition_condition(
                transition.condition_type.as_deref(),
                transition.condition_value.as_deref(),
            )?;

            // Evaluate the transition
            if Self::evaluate_transition(&transition, station_execution).await? {
                tracing::info!(
                    transition_id = ?transition.id,
                    current_station_id = ?current_station_id,
                    next_station_id = ?transition.target_station_id,
                    condition_type = ?transition.condition_type,
                    "Transition matched, moving to next station"
                );

                return Ok(Some(transition.target_station_id));
            }
        }

        // 4. No transitions matched - workflow is stuck
        tracing::error!(
            current_station_id = ?current_station_id,
            "No valid transition found from station"
        );

        Err(TransitionEvaluatorError::NoValidTransition(
            current_station_id,
        ))
    }

    /// Evaluate whether a single transition should be taken
    ///
    /// # Arguments
    /// * `transition` - The transition to evaluate
    /// * `station_execution` - The station execution with status and output_data
    ///
    /// # Returns
    /// * `Ok(true)` - Transition should be taken
    /// * `Ok(false)` - Transition should not be taken
    /// * `Err(...)` - Evaluation failed
    async fn evaluate_transition(
        transition: &StationTransition,
        station_execution: &StationExecution,
    ) -> TransitionEvaluatorResult<bool> {
        match transition.condition_type.as_deref() {
            // Unconditional: Always transition
            Some("unconditional") | Some("always") | None => {
                tracing::debug!(
                    transition_id = ?transition.id,
                    "Transition is unconditional, always taking it"
                );
                Ok(true)
            }

            // Success: Only if station completed successfully
            Some("success") => {
                let should_transition = station_execution.status == "completed";
                tracing::debug!(
                    transition_id = ?transition.id,
                    station_status = %station_execution.status,
                    result = should_transition,
                    "Evaluating success transition"
                );
                Ok(should_transition)
            }

            // Failure: Only if station failed
            Some("failure") => {
                let should_transition = station_execution.status == "failed";
                tracing::debug!(
                    transition_id = ?transition.id,
                    station_status = %station_execution.status,
                    result = should_transition,
                    "Evaluating failure transition"
                );
                Ok(should_transition)
            }

            // Conditional: Evaluate expression against output_data
            Some("conditional") => {
                if let Some(condition_value) = &transition.condition_value {
                    tracing::debug!(
                        transition_id = ?transition.id,
                        condition = %condition_value,
                        "Evaluating conditional transition"
                    );

                    let result = Self::evaluate_condition(condition_value, station_execution)?;

                    tracing::debug!(
                        transition_id = ?transition.id,
                        result = result,
                        "Conditional transition evaluation complete"
                    );

                    Ok(result)
                } else {
                    tracing::warn!(
                        transition_id = ?transition.id,
                        "Conditional transition has no condition_value, defaulting to false"
                    );
                    Ok(false)
                }
            }

            // Unknown condition type
            Some(unknown) => {
                tracing::warn!(
                    transition_id = ?transition.id,
                    condition_type = %unknown,
                    "Unknown condition_type, defaulting to false"
                );
                Ok(false)
            }
        }
    }

    /// Evaluate a conditional expression against station output
    ///
    /// Supports multiple condition formats:
    /// 1. Simple string (key existence): "review_passed"
    /// 2. JSON object (key-value): {"key": "review_passed", "value": true}
    /// 3. Legacy format: {"check_output_key": "...", "expected_value": ...}
    ///
    /// # Arguments
    /// * `condition` - The condition expression (from transition.condition_value)
    /// * `station_output` - The station execution with output_data
    ///
    /// # Returns
    /// * `Ok(true)` - Condition is satisfied
    /// * `Ok(false)` - Condition is not satisfied (including missing keys)
    /// * `Err(...)` - Evaluation failed (invalid JSON, etc.)
    fn evaluate_condition(
        condition: &str,
        station_execution: &StationExecution,
    ) -> TransitionEvaluatorResult<bool> {
        // Parse station output_data (if available)
        let output = if let Some(output_data) = &station_execution.output_data {
            serde_json::from_str::<JsonValue>(output_data).map_err(|e| {
                TransitionEvaluatorError::OutputDataParseError(format!(
                    "Failed to parse station output data: {}",
                    e
                ))
            })?
        } else {
            // No output data - condition cannot be satisfied
            tracing::debug!("No output data available, condition evaluates to false");
            return Ok(false);
        };

        // Try parsing condition as JSON
        let condition_result = serde_json::from_str::<JsonValue>(condition);

        match condition_result {
            // Format 1: JSON string (key existence check)
            // Example: "review_passed"
            Ok(JsonValue::String(key)) => {
                let exists = output.get(&key).is_some();
                tracing::debug!(
                    key = %key,
                    exists = exists,
                    "Evaluating key existence check"
                );
                Ok(exists)
            }

            // Format 2 & 3: JSON object
            Ok(JsonValue::Object(condition_obj)) => {
                // Modern format: {"key": "...", "value": ...}
                if let (Some(key), Some(expected_value)) = (
                    condition_obj.get("key").and_then(|v| v.as_str()),
                    condition_obj.get("value"),
                ) {
                    if let Some(actual_value) = output.get(key) {
                        let matches = actual_value == expected_value;
                        tracing::debug!(
                            key = %key,
                            expected = ?expected_value,
                            actual = ?actual_value,
                            matches = matches,
                            "Evaluating key-value comparison (modern format)"
                        );
                        return Ok(matches);
                    } else {
                        tracing::debug!(
                            key = %key,
                            "Key not found in output data"
                        );
                        return Ok(false);
                    }
                }

                // Legacy format: {"check_output_key": "...", "expected_value": ...}
                if let (Some(check_key), Some(expected_value)) = (
                    condition_obj.get("check_output_key").and_then(|v| v.as_str()),
                    condition_obj.get("expected_value"),
                ) {
                    if let Some(actual_value) = output.get(check_key) {
                        let matches = actual_value == expected_value;
                        tracing::debug!(
                            key = %check_key,
                            expected = ?expected_value,
                            actual = ?actual_value,
                            matches = matches,
                            "Evaluating key-value comparison (legacy format)"
                        );
                        return Ok(matches);
                    } else {
                        tracing::debug!(
                            key = %check_key,
                            "Key not found in output data (legacy format)"
                        );
                        return Ok(false);
                    }
                }

                // Unknown object format
                Err(TransitionEvaluatorError::TransitionEvaluationError(
                    format!(
                        "Unsupported condition object format. Expected {{\"key\": \"...\", \"value\": ...}} or {{\"check_output_key\": \"...\", \"expected_value\": ...}}, got: {}",
                        condition
                    )
                ))
            }

            // Format 4: Other JSON types (not supported)
            Ok(_) => Err(TransitionEvaluatorError::TransitionEvaluationError(
                format!(
                    "Unsupported condition type. Expected string (key name) or object, got: {}",
                    condition
                ),
            )),

            // Format 5: Not valid JSON - treat as plain string key name
            // Example: review_passed (without quotes)
            Err(_) => {
                let exists = output.get(condition).is_some();
                tracing::debug!(
                    key = %condition,
                    exists = exists,
                    "Evaluating plain string key existence"
                );
                Ok(exists)
            }
        }
    }

    /// Validate transition condition syntax
    ///
    /// This validates that a transition condition is well-formed before evaluation.
    /// Prevents cryptic runtime errors by catching syntax issues early.
    ///
    /// # Arguments
    /// * `condition_type` - The type of condition (success, failure, conditional, etc.)
    /// * `condition_value` - The condition expression (only required for conditional)
    ///
    /// # Returns
    /// * `Ok(())` - Condition syntax is valid
    /// * `Err(InvalidTransitionSyntax)` - Condition has syntax errors
    fn validate_transition_condition(
        condition_type: Option<&str>,
        condition_value: Option<&str>,
    ) -> TransitionEvaluatorResult<()> {
        match condition_type {
            Some("conditional") => {
                if let Some(value) = condition_value {
                    // If it starts with '{', validate JSON syntax
                    if value.starts_with('{') {
                        serde_json::from_str::<JsonValue>(value).map_err(|e| {
                            TransitionEvaluatorError::InvalidTransitionSyntax(format!(
                                "Invalid JSON in condition_value: {}",
                                e
                            ))
                        })?;
                    }
                    Ok(())
                } else {
                    Err(TransitionEvaluatorError::InvalidTransitionSyntax(
                        "Conditional transition requires condition_value".to_string(),
                    ))
                }
            }
            Some("success") | Some("failure") | Some("unconditional") | Some("always") | None => {
                Ok(())
            }
            Some(unknown) => Err(TransitionEvaluatorError::InvalidTransitionSyntax(
                format!("Unknown condition_type: {}", unknown),
            )),
        }
    }

    /// Detect circular workflows by checking if next station was already visited
    ///
    /// This prevents infinite loops by tracking which stations have been executed
    /// in the current workflow execution.
    ///
    /// # Arguments
    /// * `pool` - Database connection pool
    /// * `workflow_execution_id` - The workflow execution to check
    /// * `next_station_id` - The station we're about to visit
    ///
    /// # Returns
    /// * `Ok(())` - No circular reference detected
    /// * `Err(CircularWorkflow)` - Station has already been visited
    #[allow(dead_code)]
    pub async fn detect_circular_workflow(
        pool: &SqlitePool,
        workflow_execution_id: Uuid,
        next_station_id: Uuid,
    ) -> TransitionEvaluatorResult<()> {
        // Get all station executions for this workflow
        let station_executions =
            StationExecution::find_by_workflow_execution(pool, workflow_execution_id).await?;

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

            return Err(TransitionEvaluatorError::CircularWorkflow(
                visited_stations,
            ));
        }

        Ok(())
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
        let output_data = r#"{"review_passed": true, "tests_run": 42}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let result =
            TransitionEvaluator::evaluate_condition("review_passed", &station_execution).unwrap();

        assert!(result, "Should return true when key exists");
    }

    #[tokio::test]
    async fn test_evaluate_condition_key_not_exists() {
        let output_data = r#"{"review_passed": true}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let result =
            TransitionEvaluator::evaluate_condition("nonexistent_key", &station_execution).unwrap();

        assert!(!result, "Should return false when key doesn't exist");
    }

    #[tokio::test]
    async fn test_evaluate_condition_value_comparison_boolean() {
        let output_data = r#"{"review_passed": true}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let condition = r#"{"key": "review_passed", "value": true}"#;
        let result = TransitionEvaluator::evaluate_condition(condition, &station_execution).unwrap();

        assert!(result, "Should return true when boolean values match");
    }

    #[tokio::test]
    async fn test_evaluate_condition_value_comparison_false() {
        let output_data = r#"{"review_passed": true}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let condition = r#"{"key": "review_passed", "value": false}"#;
        let result = TransitionEvaluator::evaluate_condition(condition, &station_execution).unwrap();

        assert!(!result, "Should return false when values don't match");
    }

    #[tokio::test]
    async fn test_evaluate_condition_string_value() {
        let output_data = r#"{"status": "approved", "reviewer": "alice"}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let condition = r#"{"key": "status", "value": "approved"}"#;
        let result = TransitionEvaluator::evaluate_condition(condition, &station_execution).unwrap();

        assert!(result, "Should return true when string values match");
    }

    #[tokio::test]
    async fn test_evaluate_condition_number_value() {
        let output_data = r#"{"test_failures": 0, "tests_passed": 42}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let condition = r#"{"key": "test_failures", "value": 0}"#;
        let result = TransitionEvaluator::evaluate_condition(condition, &station_execution).unwrap();

        assert!(result, "Should return true when number values match");
    }

    #[tokio::test]
    async fn test_evaluate_condition_legacy_format() {
        let output_data = r#"{"review_passed": true}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");

        let condition = r#"{"check_output_key": "review_passed", "expected_value": true}"#;
        let result = TransitionEvaluator::evaluate_condition(condition, &station_execution).unwrap();

        assert!(result, "Should support legacy format");
    }

    #[tokio::test]
    async fn test_transition_unconditional() {
        let station_execution = create_test_station_execution(None, "completed");
        let transition = create_test_transition(Some("unconditional"), None);

        let result = TransitionEvaluator::evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(result, "Unconditional transition should always be true");
    }

    #[tokio::test]
    async fn test_transition_always() {
        let station_execution = create_test_station_execution(None, "completed");
        let transition = create_test_transition(Some("always"), None);

        let result = TransitionEvaluator::evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(result, "'always' transition should always be true");
    }

    #[tokio::test]
    async fn test_transition_null_type() {
        let station_execution = create_test_station_execution(None, "completed");
        let transition = create_test_transition(None, None);

        let result = TransitionEvaluator::evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(result, "Null condition_type should default to unconditional");
    }

    #[tokio::test]
    async fn test_transition_success() {
        let station_execution = create_test_station_execution(None, "completed");
        let transition = create_test_transition(Some("success"), None);

        let result = TransitionEvaluator::evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(
            result,
            "Success transition should be true for completed status"
        );
    }

    #[tokio::test]
    async fn test_transition_success_with_failed_status() {
        let station_execution = create_test_station_execution(None, "failed");
        let transition = create_test_transition(Some("success"), None);

        let result = TransitionEvaluator::evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(
            !result,
            "Success transition should be false for failed status"
        );
    }

    #[tokio::test]
    async fn test_transition_failure() {
        let station_execution = create_test_station_execution(None, "failed");
        let transition = create_test_transition(Some("failure"), None);

        let result = TransitionEvaluator::evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(result, "Failure transition should be true for failed status");
    }

    #[tokio::test]
    async fn test_transition_failure_with_completed_status() {
        let station_execution = create_test_station_execution(None, "completed");
        let transition = create_test_transition(Some("failure"), None);

        let result = TransitionEvaluator::evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(
            !result,
            "Failure transition should be false for completed status"
        );
    }

    #[tokio::test]
    async fn test_transition_conditional_with_matching_key() {
        let output_data = r#"{"review_passed": true}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");
        let transition = create_test_transition(Some("conditional"), Some("review_passed"));

        let result = TransitionEvaluator::evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(result, "Conditional transition should match when key exists");
    }

    #[tokio::test]
    async fn test_transition_conditional_with_matching_value() {
        let output_data = r#"{"review_passed": true}"#;
        let station_execution = create_test_station_execution(Some(output_data), "completed");
        let condition = r#"{"key": "review_passed", "value": true}"#;
        let transition = create_test_transition(Some("conditional"), Some(condition));

        let result = TransitionEvaluator::evaluate_transition(&transition, &station_execution)
            .await
            .unwrap();

        assert!(
            result,
            "Conditional transition should match when key-value matches"
        );
    }

    #[tokio::test]
    async fn test_no_output_data_returns_false() {
        let station_execution = create_test_station_execution(None, "completed");

        let result =
            TransitionEvaluator::evaluate_condition("any_key", &station_execution).unwrap();

        assert!(
            !result,
            "Should return false when there's no output data"
        );
    }

    #[test]
    fn test_validate_transition_condition_success() {
        assert!(TransitionEvaluator::validate_transition_condition(Some("success"), None).is_ok());
    }

    #[test]
    fn test_validate_transition_condition_failure() {
        assert!(TransitionEvaluator::validate_transition_condition(Some("failure"), None).is_ok());
    }

    #[test]
    fn test_validate_transition_condition_unconditional() {
        assert!(
            TransitionEvaluator::validate_transition_condition(Some("unconditional"), None).is_ok()
        );
    }

    #[test]
    fn test_validate_transition_condition_always() {
        assert!(TransitionEvaluator::validate_transition_condition(Some("always"), None).is_ok());
    }

    #[test]
    fn test_validate_transition_condition_null() {
        assert!(TransitionEvaluator::validate_transition_condition(None, None).is_ok());
    }

    #[test]
    fn test_validate_transition_condition_conditional_valid() {
        assert!(TransitionEvaluator::validate_transition_condition(
            Some("conditional"),
            Some(r#"{"key": "test", "value": true}"#)
        )
        .is_ok());
    }

    #[test]
    fn test_validate_transition_condition_conditional_without_value() {
        assert!(
            TransitionEvaluator::validate_transition_condition(Some("conditional"), None).is_err()
        );
    }

    #[test]
    fn test_validate_transition_condition_conditional_malformed_json() {
        assert!(TransitionEvaluator::validate_transition_condition(
            Some("conditional"),
            Some(r#"{"key": "test", broken"#)
        )
        .is_err());
    }

    #[test]
    fn test_validate_transition_condition_unknown_type() {
        assert!(
            TransitionEvaluator::validate_transition_condition(Some("unknown"), None).is_err()
        );
    }

    #[test]
    fn test_validate_transition_condition_plain_string() {
        // Plain strings (non-JSON) should be valid for conditional transitions
        assert!(TransitionEvaluator::validate_transition_condition(
            Some("conditional"),
            Some("review_passed")
        )
        .is_ok());
    }
}
