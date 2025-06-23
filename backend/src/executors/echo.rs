use async_trait::async_trait;
use tokio::process::{Child, Command};
use uuid::Uuid;

use crate::executor::{Executor, ExecutorError};
use crate::models::task::Task;

/// A dummy executor that echoes the task title and description
pub struct EchoExecutor;

#[async_trait]
impl Executor for EchoExecutor {
    async fn spawn(
        &self,
        pool: &sqlx::SqlitePool,
        task_id: Uuid,
        _worktree_path: &str,
    ) -> Result<Child, ExecutorError> {
        // Get the task to fetch its description
        let task = Task::find_by_id(pool, task_id)
            .await?
            .ok_or(ExecutorError::TaskNotFound)?;

        let _message = format!(
            "Executing task: {} - {}",
            task.title,
            task.description.as_deref().unwrap_or("No description")
        );

        // For demonstration of streaming, we can use a shell command that outputs multiple lines
        let script = format!(
            r#"echo "Starting task: {}"
for i in {{1..50}}; do
    echo "Progress line $i"
    sleep 1
done
echo "Task completed: {}""#,
            task.title, task.title
        );

        let child = Command::new("sh")
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .arg("-c")
            .arg(&script)
            .process_group(0) // Create new process group so we can kill entire tree
            .spawn()
            .map_err(ExecutorError::SpawnFailed)?;

        Ok(child)
    }

    async fn spawn_follow_up(
        &self,
        _pool: &sqlx::SqlitePool,
        _task_id: Uuid,
        session_id: &str,
        message: &str,
        _worktree_path: &str,
    ) -> Result<Child, ExecutorError> {
        let script = format!(
            r#"echo "Follow-up execution for session: {}"
echo "Message: {}"
for i in {{1..10}}; do
    echo "Follow-up progress line $i"
    sleep 1
done
echo "Follow-up completed""#,
            session_id, message
        );

        let child = Command::new("sh")
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .arg("-c")
            .arg(&script)
            .process_group(0) // Create new process group so we can kill entire tree
            .spawn()
            .map_err(ExecutorError::SpawnFailed)?;

        Ok(child)
    }
}
