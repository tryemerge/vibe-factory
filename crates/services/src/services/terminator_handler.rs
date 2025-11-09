use chrono::Utc;
use db::models::{
    station_execution::{CreateStationExecution, StationExecution},
    task::{Task, TaskStatus},
    task_attempt::TaskAttempt,
    workflow_execution::WorkflowExecution,
    workflow_station::WorkflowStation,
};
use thiserror::Error;
use tracing::{error, info};
use uuid::Uuid;

use super::github_service::{CreatePrRequest, GitHubService, GitHubServiceError};

#[derive(Debug, Error)]
pub enum TerminatorHandlerError {
    #[error("Station is not a terminator station")]
    InvalidTerminatorStation,
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("GitHub service error: {0}")]
    GitHub(#[from] GitHubServiceError),
    #[error("Task attempt not found for workflow execution")]
    TaskAttemptNotFound,
    #[error("Task not found")]
    TaskNotFound,
    #[error("Workflow execution not found")]
    WorkflowExecutionNotFound,
    #[error("No GitHub token available")]
    NoGitHubToken,
    #[error("Project has no git repository configured")]
    NoGitRepository,
}

/// Service to handle workflow completion actions when execution reaches a terminator station
pub struct TerminatorHandler;

impl TerminatorHandler {
    /// Execute terminator actions when workflow reaches a terminator station
    ///
    /// This method:
    /// 1. Verifies the station is a terminator
    /// 2. Creates or updates GitHub PR for the task attempt (non-blocking)
    /// 3. Creates station execution record for audit trail
    /// 4. Updates task status to "inreview"
    /// 5. Marks workflow execution as completed
    /// 6. Logs terminator execution
    ///
    /// # Error Handling
    /// - GitHub API failures are logged but don't fail the workflow
    /// - Task update failures will rollback and return error
    /// - Allows graceful degradation for PR creation
    ///
    /// # Parameters
    /// - `pool`: Database connection pool
    /// - `github_token`: Optional GitHub token for PR creation
    /// - `git_repo_path`: Path to the git repository
    /// - `task`: The task being executed
    /// - `workflow_execution`: The workflow execution
    /// - `station`: The terminator station
    /// - `task_attempt`: The task attempt
    pub async fn execute(
        pool: &sqlx::SqlitePool,
        github_token: Option<String>,
        git_repo_path: String,
        task: &Task,
        workflow_execution: &WorkflowExecution,
        station: &WorkflowStation,
        task_attempt: &TaskAttempt,
    ) -> Result<(), TerminatorHandlerError> {

        // 1. Verify station is a terminator
        if !station.is_terminator {
            return Err(TerminatorHandlerError::InvalidTerminatorStation);
        }

        info!(
            "Executing terminator station {} for workflow execution {}",
            station.id, workflow_execution.id
        );

        // 2. Create or update GitHub PR for the task attempt (non-blocking)
        let pr_url = Self::create_pull_request_safe(
            github_token,
            &git_repo_path,
            task,
            task_attempt,
        )
        .await;

        // 3. Start database transaction for station execution, task, and workflow updates
        let mut tx = pool.begin().await?;

        // Create station execution record for terminator (for audit trail)
        let completed_at = Utc::now();
        let station_execution_id = Uuid::new_v4();
        let station_execution = StationExecution::create(
            pool,
            CreateStationExecution {
                workflow_execution_id: workflow_execution.id,
                station_id: station.id,
                status: "completed".to_string(),
                execution_process_id: None,
            },
            station_execution_id,
        )
        .await?;

        // Update station execution to mark as completed immediately
        sqlx::query!(
            "UPDATE station_executions SET started_at = $2, completed_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            station_execution.id,
            completed_at
        )
        .execute(&mut *tx)
        .await?;

        info!(
            "Created completed station execution {} for terminator station {}",
            station_execution.id, station.id
        );

        // Update task status to "inreview"
        sqlx::query!(
            "UPDATE tasks SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            task.id,
            TaskStatus::InReview as TaskStatus
        )
        .execute(&mut *tx)
        .await?;

        info!(
            "Updated task {} status to InReview for terminator station {}",
            task.id, station.id
        );

        // 5. Mark workflow execution as completed and update current_station_id to terminator
        sqlx::query!(
            "UPDATE workflow_executions SET current_station_id = $2, status = $3, completed_at = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            workflow_execution.id,
            station.id,
            "completed",
            completed_at
        )
        .execute(&mut *tx)
        .await?;

        info!(
            "Marked workflow execution {} as completed at terminator station {}",
            workflow_execution.id, station.id
        );

        // Commit the transaction
        tx.commit().await?;

        // 6. Log terminator execution completion
        info!(
            "Terminator station {} execution completed for workflow {} (task: {}, attempt: {})",
            station.id,
            workflow_execution.id,
            task.id,
            task_attempt.id
        );

        if let Some(url) = pr_url {
            info!("Created GitHub PR: {}", url);
        }

        Ok(())
    }

    /// Create GitHub PR for completed workflow (with error handling)
    ///
    /// This method attempts to create a GitHub PR but logs errors instead of failing.
    /// Returns the PR URL if successful, None if it fails.
    async fn create_pull_request_safe(
        github_token: Option<String>,
        git_repo_path: &str,
        task: &Task,
        task_attempt: &TaskAttempt,
    ) -> Option<String> {
        match Self::create_pull_request(github_token, git_repo_path, task, task_attempt).await {
            Ok(url) => Some(url),
            Err(e) => {
                error!(
                    "Failed to create GitHub PR for task attempt {} (task: {}): {}",
                    task_attempt.id, task.id, e
                );
                None
            }
        }
    }

    /// Create GitHub PR for completed workflow
    ///
    /// Creates a PR from the task attempt branch to the base branch.
    /// - PR title is from task title
    /// - PR body is from task description (if available)
    /// - Base branch comes from task_attempt.target_branch
    async fn create_pull_request(
        github_token: Option<String>,
        git_repo_path: &str,
        task: &Task,
        task_attempt: &TaskAttempt,
    ) -> Result<String, TerminatorHandlerError> {
        // Get GitHub token
        let github_token = github_token.ok_or(TerminatorHandlerError::NoGitHubToken)?;

        // Get GitHub repository info
        let git_service = super::git::GitService::new();
        let repo_info = git_service
            .get_github_repo_info(std::path::Path::new(git_repo_path))
            .map_err(|e| {
                GitHubServiceError::Repository(format!("Failed to get GitHub repo info: {}", e))
            })?;

        // Create GitHub service
        let github_service = GitHubService::new(&github_token)?;

        // Prepare PR request
        let pr_title = task.title.clone();
        let pr_body = task.description.clone();
        let head_branch = task_attempt.branch.clone();
        let base_branch = task_attempt.target_branch.clone();

        let pr_request = CreatePrRequest {
            title: pr_title,
            body: pr_body,
            head_branch,
            base_branch,
        };

        // Create the pull request
        let pr_info = github_service.create_pr(&repo_info, &pr_request).await?;

        info!(
            "Created GitHub PR #{} for task attempt {} (task: {}): {}",
            pr_info.number, task_attempt.id, task.id, pr_info.url
        );

        Ok(pr_info.url)
    }
}
