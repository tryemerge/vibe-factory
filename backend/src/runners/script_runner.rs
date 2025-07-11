//! Runner for executing setup scripts

use command_group::AsyncGroupChild;
use uuid::Uuid;

use crate::{
    models::{project::Project, task::Task},
    runners::command_builder::{CommandBuilder, CommandError},
};

/// Runner for executing project setup scripts
pub struct ScriptRunner {
    pub script: String,
}

impl ScriptRunner {
    /// Create a new script runner
    pub fn new(script: String) -> Self {
        Self { script }
    }

    /// Spawn the setup script process
    pub async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<AsyncGroupChild, CommandError> {
        // Validate the task and project exist
        let task = Task::find_by_id(pool, task_id)
            .await
            .map_err(|e| CommandError::ValidationError(format!("Database error: {}", e)))?
            .ok_or_else(|| CommandError::ValidationError("Task not found".to_string()))?;

        let _project = Project::find_by_id(pool, task.project_id)
            .await
            .map_err(|e| CommandError::ValidationError(format!("Database error: {}", e)))?
            .ok_or_else(|| CommandError::ValidationError("Project not found".to_string()))?;

        // Build and spawn the command
        CommandBuilder::shell_script(&self.script)
            .current_dir(worktree_path)
            .runner_type("SetupScript")
            .with_task(task_id, Some(task.title))
            .with_context("Setup script execution")
            .spawn()
    }
}
