use async_trait::async_trait;
use tokio::process::{Child, Command};
use uuid::Uuid;

use crate::executor::{Executor, ExecutorError};
use crate::models::project::Project;
use crate::models::task::Task;

use libc;
use std::os::unix::process::CommandExt; // for before_exec
use tokio::process::Command; // make sure libc is in your Cargo.toml

/// Executor for running project dev server scripts
pub struct DevServerExecutor {
    pub script: String,
}

#[async_trait]
impl Executor for DevServerExecutor {
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
            .process_group(0)
            .before_exec(|| {
                // if *this* child’s parent ever dies, the kernel will SIGTERM it
                unsafe { libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM) };
                Ok(())
            })
            .spawn()
            .map_err(ExecutorError::SpawnFailed)?;

        Ok(child)
    }
}
