use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Task {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub creator_member_id: Option<Uuid>,
    pub assignee_member_id: Option<Uuid>,
    pub title: String,
    pub description: String,
    pub status: String,
    pub shared: bool,
    pub shared_at: Option<DateTime<Utc>>,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTaskData {
    pub title: String,
    pub description: Option<String>,
    pub assignee_member_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateTaskData {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub version: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TransferAssignmentData {
    pub new_assignee_member_id: Uuid,
    pub previous_assignee_member_id: Option<Uuid>,
    pub version: Option<i64>,
}

#[derive(Debug)]
pub enum TaskError {
    NotFound,
    Conflict(String),
    Database(sqlx::Error),
}

impl From<sqlx::Error> for TaskError {
    fn from(error: sqlx::Error) -> Self {
        if matches!(error, sqlx::Error::RowNotFound) {
            Self::NotFound
        } else {
            Self::Database(error)
        }
    }
}

pub struct TaskRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> TaskRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        organization_id: Uuid,
        data: CreateTaskData,
    ) -> Result<Task, TaskError> {
        let mut tx = self.pool.begin().await.map_err(TaskError::from)?;
        let description = data.description.unwrap_or_default();

        let task = sqlx::query_as!(
            Task,
            r#"
            INSERT INTO tasks (
                organization_id,
                assignee_member_id,
                title,
                description,
                shared,
                shared_at
            )
            VALUES ($1, $2, $3, $4, TRUE, NOW())
            RETURNING id                AS "id!",
                      organization_id   AS "organization_id!",
                      creator_member_id AS "creator_member_id?",
                      assignee_member_id AS "assignee_member_id?",
                      title             AS "title!",
                      description       AS "description!",
                      status            AS "status!",
                      shared            AS "shared!",
                      shared_at         AS "shared_at?",
                      version           AS "version!",
                      created_at        AS "created_at!",
                      updated_at        AS "updated_at!"
            "#,
            organization_id,
            data.assignee_member_id,
            data.title,
            description
        )
        .fetch_one(&mut *tx)
        .await?;

        let payload = serde_json::to_value(&task)
            .map_err(|e| TaskError::Conflict(format!("could not serialize task snapshot: {e}")))?;

        insert_activity(&mut tx, &task, "task.created", payload).await?;
        tx.commit().await.map_err(TaskError::from)?;
        Ok(task)
    }

    pub async fn update(&self, task_id: Uuid, data: UpdateTaskData) -> Result<Task, TaskError> {
        let mut tx = self.pool.begin().await.map_err(TaskError::from)?;

        let task = sqlx::query_as!(
            Task,
            r#"
        UPDATE tasks AS t
        SET title       = COALESCE($2, t.title),
            description = COALESCE($3, t.description),
            status      = COALESCE($4, t.status),
            version     = t.version + 1,
            updated_at  = NOW()
        WHERE t.id = $1
          AND t.version = COALESCE($5, t.version)
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!",
            t.creator_member_id AS "creator_member_id?",
            t.assignee_member_id AS "assignee_member_id?",
            t.title             AS "title!",
            t.description       AS "description!",
            t.status            AS "status!",
            t.shared            AS "shared!",
            t.shared_at         AS "shared_at?",
            t.version           AS "version!",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.title,
            data.description,
            data.status,
            data.version
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| TaskError::Conflict("task version mismatch".to_string()))?;

        let payload = serde_json::to_value(&task)
            .map_err(|e| TaskError::Conflict(format!("could not serialize task snapshot: {e}")))?;

        insert_activity(&mut tx, &task, "task.updated", payload).await?;

        tx.commit().await.map_err(TaskError::from)?;
        Ok(task)
    }

    pub async fn transfer_assignment(
        &self,
        task_id: Uuid,
        data: TransferAssignmentData,
    ) -> Result<Task, TaskError> {
        let mut tx = self.pool.begin().await.map_err(TaskError::from)?;

        let task = sqlx::query_as!(
            Task,
            r#"
        UPDATE tasks AS t
        SET assignee_member_id = $2,
            version = t.version + 1,
            updated_at = NOW()
        WHERE t.id = $1
          AND t.version = COALESCE($4, t.version)
          AND ($3::uuid IS NULL OR t.assignee_member_id = $3::uuid)
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!",
            t.creator_member_id AS "creator_member_id?",
            t.assignee_member_id AS "assignee_member_id?",
            t.title             AS "title!",
            t.description       AS "description!",
            t.status            AS "status!",
            t.shared            AS "shared!",
            t.shared_at         AS "shared_at?",
            t.version           AS "version!",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.new_assignee_member_id,
            data.previous_assignee_member_id,
            data.version
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| {
            TaskError::Conflict("task version or previous assignee mismatch".to_string())
        })?;

        let payload = serde_json::to_value(&task)
            .map_err(|e| TaskError::Conflict(format!("could not serialize task snapshot: {e}")))?;

        insert_activity(&mut tx, &task, "task.assignment_transferred", payload).await?;
        tx.commit().await.map_err(TaskError::from)?;
        Ok(task)
    }
}

async fn insert_activity(
    tx: &mut Tx<'_>,
    task: &Task,
    event_type: &str,
    payload: Value,
) -> Result<(), TaskError> {
    sqlx::query!(
        r#"
        INSERT INTO activity (
            organization_id,
            task_id,
            actor_member_id,
            assignee_member_id,
            task_version,
            event_type,
            payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        task.organization_id,
        task.id,
        None::<Uuid>,
        task.assignee_member_id,
        task.version,
        event_type,
        payload
    )
    .execute(&mut **tx)
    .await
    .map(|_| ())
    .map_err(TaskError::from)
}
