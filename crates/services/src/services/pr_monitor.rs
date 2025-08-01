use std::{path::Path, sync::Arc, time::Duration};

use db::models::{
    task::{Task, TaskStatus},
    task_attempt::TaskAttempt,
};
use sqlx::SqlitePool;
use thiserror::Error;
use tokio::{sync::RwLock, time::interval};
use uuid::Uuid;

use crate::services::{
    config::Config,
    git::{GitService, GitServiceError},
    github_service::{GitHubRepoInfo, GitHubService, GitHubServiceError},
};

#[derive(Debug, Error)]
pub enum PrMonitorError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    GitService(#[from] GitServiceError),
    #[error(transparent)]
    GitHub(#[from] GitHubServiceError),
    #[error("Failed to get GitHub token from config")]
    NoGitHubToken,
    #[error("Failed to parse repository info from path: {path}")]
    InvalidRepoPath { path: String },
    #[error("PR monitoring failed: {0}")]
    MonitoringError(String),
}

/// Service to monitor GitHub PRs and update task status when they are merged
pub struct PrMonitorService {
    pool: SqlitePool,
    poll_interval: Duration,
}

#[derive(Debug)]
pub struct PrInfo {
    pub attempt_id: Uuid,
    pub task_id: Uuid,
    pub project_id: Uuid,
    pub pr_number: i64,
    pub repo_owner: String,
    pub repo_name: String,
    pub github_token: String,
}

impl PrMonitorService {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            poll_interval: Duration::from_secs(60), // Check every minute
        }
    }

    /// Start the PR monitoring service with config
    pub async fn start(&self, config: Arc<RwLock<Config>>) {
        tracing::info!(
            "Starting PR monitoring service with interval {:?}",
            self.poll_interval
        );

        let mut interval = interval(self.poll_interval);

        loop {
            interval.tick().await;

            // Get GitHub token from config
            let github_token = {
                let config_read = config.read().await;
                if config_read.github.pat.is_some() {
                    config_read.github.pat.clone()
                } else {
                    config_read.github.token.clone()
                }
            };

            match github_token {
                Some(token) => {
                    if let Err(e) = self.check_open_pr_status(&token).await {
                        tracing::error!("Error checking PRs: {:?}", e);
                    }
                }
                None => {
                    tracing::debug!("No GitHub token configured, skipping PR monitoring");
                }
            }
        }
    }

    /// Check all open PRs for updates with the provided GitHub token
    async fn check_open_pr_status(&self, github_token: &str) -> Result<(), PrMonitorError> {
        let open_prs = self.get_open_prs(github_token).await?;

        if open_prs.is_empty() {
            tracing::debug!("No open PRs to check");
            return Ok(());
        }

        tracing::info!("Checking {} open PRs", open_prs.len());

        for pr_info in open_prs {
            if let Err(e) = self.check_pr_status(&pr_info).await {
                tracing::error!(
                    "Error checking PR #{} for attempt {}: {:?}",
                    pr_info.pr_number,
                    pr_info.attempt_id,
                    e
                );
            }
        }

        Ok(())
    }

    /// Get all task attempts with open PRs using the provided GitHub token
    async fn get_open_prs(&self, github_token: &str) -> Result<Vec<PrInfo>, PrMonitorError> {
        let pr_infos = TaskAttempt::select_open_pr_entries(&self.pool)
            .await?
            .into_iter()
            .filter_map(|entry| {
                match GitService::new().get_github_repo_info(Path::new(&entry.git_repo_path)) {
                    Ok((owner, repo_name)) => Some(PrInfo {
                        attempt_id: entry.attempt_id,
                        task_id: entry.task_id,
                        project_id: entry.project_id,
                        pr_number: entry.pr_number,
                        repo_owner: owner,
                        repo_name,
                        github_token: github_token.to_string(),
                    }),
                    Err(e) => {
                        tracing::warn!(
                            "Could not extract repo info from git path {}: {}",
                            entry.git_repo_path,
                            e
                        );
                        None
                    }
                }
            })
            .collect();

        Ok(pr_infos)
    }

    /// Check the status of a specific PR
    async fn check_pr_status(&self, pr_info: &PrInfo) -> Result<(), PrMonitorError> {
        let github_service = GitHubService::new(&pr_info.github_token)?;
        let repo_info = GitHubRepoInfo {
            owner: pr_info.repo_owner.clone(),
            repo_name: pr_info.repo_name.clone(),
        };

        let pr_status = github_service
            .update_pr_status(&repo_info, pr_info.pr_number)
            .await?;

        tracing::debug!(
            "PR #{} status: {} (was open)",
            pr_info.pr_number,
            pr_status.status
        );

        if pr_status.status != "open" {
            // Extract merge commit SHA if the PR was merged
            let merge_commit_sha = pr_status.merge_commit_sha.as_deref();

            TaskAttempt::update_pr_status(
                &self.pool,
                pr_info.attempt_id,
                &pr_status.status,
                pr_status.merged_at,
                merge_commit_sha,
            )
            .await?;

            // If the PR was merged, update the task status to done
            if pr_status.merged {
                tracing::info!(
                    "PR #{} was merged, updating task {} to done",
                    pr_info.pr_number,
                    pr_info.task_id
                );

                Task::update_status(
                    &self.pool,
                    pr_info.task_id,
                    pr_info.project_id,
                    TaskStatus::Done,
                )
                .await?;
            }
        }

        Ok(())
    }
}
