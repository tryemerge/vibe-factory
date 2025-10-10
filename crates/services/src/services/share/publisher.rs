use std::time::Duration;

use db::{
    DBService,
    models::{project::Project, shared_task::SharedTask, task::Task},
};
use remote::db::tasks::SharedTask as RemoteSharedTask;
use reqwest::{Client as HttpClient, StatusCode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{RemoteSyncConfig, ShareError, convert_remote_task};

#[derive(Clone)]
pub struct ShareTaskPublisher {
    db: DBService,
    config: RemoteSyncConfig,
    client: HttpClient,
}

impl ShareTaskPublisher {
    pub fn new(db: DBService) -> Result<Self, ShareError> {
        let config = RemoteSyncConfig::from_env()
            .ok_or(ShareError::MissingConfig("share not configured"))?;

        let client = HttpClient::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(ShareError::Transport)?;

        Ok(Self { db, config, client })
    }

    pub async fn share_task(&self, task_id: Uuid) -> Result<(), ShareError> {
        let task = Task::find_by_id(&self.db.pool, task_id)
            .await?
            .ok_or(ShareError::TaskNotFound(task_id))?;

        let project = Project::find_by_id(&self.db.pool, task.project_id)
            .await?
            .ok_or(ShareError::ProjectNotFound(task.project_id))?;

        let metadata = ProjectMetadata::try_from(&project)?;

        let payload = CreateSharedTaskRequest {
            project_id: project.id,
            project: Some(metadata),
            title: task.title.clone(),
            description: task.description.clone(),
            assignee_member_id: Some(self.config.member_id),
        };

        let response = self
            .client
            .post(self.config.create_task_endpoint())
            .json(&payload)
            .send()
            .await
            .map_err(ShareError::Transport)?;

        if response.status() == StatusCode::CONFLICT {
            tracing::warn!(task_id = %task_id, "remote task already exists; skipping create");
            return Ok(());
        }

        let response = response.error_for_status().map_err(ShareError::Transport)?;
        let resp_body: CreateTaskResponse = response.json().await?;

        let input = convert_remote_task(&resp_body.task, None);
        SharedTask::upsert(&self.db.pool, input).await?;

        Ok(())
    }
}

#[derive(Debug, Deserialize)]
struct CreateTaskResponse {
    task: RemoteSharedTask,
}

#[derive(Debug, Serialize)]
struct CreateSharedTaskRequest {
    project_id: Uuid,
    project: Option<ProjectMetadata>,
    title: String,
    description: Option<String>,
    assignee_member_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
struct ProjectMetadata {
    github_repository_id: i64,
    owner: String,
    name: String,
}

impl TryFrom<&Project> for ProjectMetadata {
    type Error = ShareError;

    fn try_from(project: &Project) -> Result<Self, Self::Error> {
        let missing = || ShareError::MissingProjectMetadata(project.id);

        Ok(Self {
            github_repository_id: project.github_repo_id.ok_or_else(missing)?,
            owner: project.github_repo_owner.clone().ok_or_else(missing)?,
            name: project
                .github_repo_name
                .clone()
                .unwrap_or_else(|| project.name.clone()),
        })
    }
}
