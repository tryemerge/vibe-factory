use async_trait::async_trait;
use tokio::process::{Child, Command};
use uuid::Uuid;

use crate::executor::{Executor, ExecutorError};
use crate::models::project::Project;
use crate::models::task::Task;

/// Executor for running project setup scripts
pub struct SetupScriptExecutor {
    pub script: String,
}

#[async_trait]
impl Executor for SetupScriptExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        worktree_path: &str,
    ) -> Result<Child, ExecutorError> {
        // Validate the task and project exist
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        let _project = Project::find_by_id(pool, task.project_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?; // Reuse TaskNotFound for simplicity

        let child = Command::new("bash")
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .arg("-c")
            .arg(&self.script)
            .current_dir(worktree_path)
            .spawn()
            .map_err(ExecutorError::SpawnFailed)?;

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        _session_id: &str,
        _message: &str,
        _worktree_path: &str,
    ) -> Result<Child, ExecutorError> {
        // Setup scripts don't support follow-up execution
        // Return an error indicating this is not supported
        Err(ExecutorError::SpawnFailed(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "Follow-up execution not supported for setup scripts",
        )))
    }
}
