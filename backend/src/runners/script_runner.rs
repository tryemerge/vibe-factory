//! Runner for executing scripts (setup scripts and dev servers)

use command_group::AsyncGroupChild;
use uuid::Uuid;

use crate::{
    models::{project::Project, task::Task},
    runners::command_builder::{CommandBuilder, CommandError},
};

/// Type of script to run
#[derive(Debug, Clone, Copy)]
pub enum ScriptType {
    /// Setup script that runs before the main executor
    Setup,
    /// Development server that runs alongside tasks
    DevServer,
}

impl ScriptType {
    /// Get the runner type string for error messages
    fn runner_type(&self) -> &'static str {
        match self {
            ScriptType::Setup => "SetupScript",
            ScriptType::DevServer => "DevServer",
        }
    }

    /// Get the context string for error messages
    fn context(&self) -> &'static str {
        match self {
            ScriptType::Setup => "Setup script execution",
            ScriptType::DevServer => "Development server execution",
        }
    }
}

/// Runner for executing project scripts
pub struct ScriptRunner {
    pub script: String,
    pub script_type: ScriptType,
}

impl ScriptRunner {
    /// Create a new script runner
    pub fn new(script: String, script_type: ScriptType) -> Self {
        Self {
            script,
            script_type,
        }
    }

    /// Spawn the script process
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
            .runner_type(self.script_type.runner_type())
            .with_task(task_id, Some(task.title))
            .with_context(self.script_type.context())
            .spawn()
    }
}
