//! Terminator Handler Service
//!
//! Placeholder for handling workflow termination by automatically creating pull requests
//! when a workflow reaches a terminator station.
//!
//! Phase 5.11: This is a stub implementation for testing. Full PR creation will be
//! implemented in a future phase.

use anyhow::{anyhow, Result};
use db::{
    DBService,
    models::{
        task::Task,
        task_attempt::TaskAttempt,
        workflow_execution::WorkflowExecution,
    },
};
use uuid::Uuid;

/// Result type for terminator handler operations
pub type TerminatorHandlerResult<T> = Result<T, TerminatorHandlerError>;

/// Errors that can occur during terminator handling
#[derive(Debug, thiserror::Error)]
pub enum TerminatorHandlerError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Task attempt not found: {0}")]
    TaskAttemptNotFound(Uuid),

    #[error("Task not found: {0}")]
    TaskNotFound(Uuid),

    #[error("Other error: {0}")]
    Other(#[from] anyhow::Error),
}

/// Service for handling workflow termination
pub struct TerminatorHandler {
    db: DBService,
}

impl TerminatorHandler {
    /// Create a new terminator handler
    pub fn new(db: DBService) -> Self {
        Self { db }
    }

    /// Handle terminator station reached
    ///
    /// Phase 5.11: Stub implementation - just logs the termination.
    /// Full PR creation will be implemented in a future phase.
    ///
    /// # Arguments
    /// * `workflow_execution_id` - The workflow execution that completed
    /// * `task_attempt_id` - The task attempt that was executing
    ///
    /// # Returns
    /// * `Ok(())` - Always succeeds for now
    pub async fn handle_termination(
        &self,
        workflow_execution_id: Uuid,
        task_attempt_id: Uuid,
    ) -> TerminatorHandlerResult<()> {
        tracing::info!(
            workflow_execution_id = ?workflow_execution_id,
            task_attempt_id = ?task_attempt_id,
            "Terminator handler invoked (stub - PR creation not yet implemented)"
        );

        // Load workflow execution
        let workflow_execution = WorkflowExecution::find_by_id(&self.db.pool, workflow_execution_id)
            .await?
            .ok_or_else(|| anyhow!("Workflow execution not found: {}", workflow_execution_id))?;

        // Load task attempt
        let task_attempt = TaskAttempt::find_by_id(&self.db.pool, task_attempt_id)
            .await?
            .ok_or(TerminatorHandlerError::TaskAttemptNotFound(task_attempt_id))?;

        // Load task
        let task = Task::find_by_id(&self.db.pool, workflow_execution.task_id)
            .await?
            .ok_or(TerminatorHandlerError::TaskNotFound(workflow_execution.task_id))?;

        tracing::info!(
            task_id = ?task.id,
            task_title = %task.title,
            branch = %task_attempt.branch,
            "Terminator station reached - in production this would create a PR"
        );

        // TODO: Implement actual PR creation in future phase:
        // 1. Push branch to remote
        // 2. Create GitHub PR via API
        // 3. Update task_attempt with PR URL

        Ok(())
    }
}
