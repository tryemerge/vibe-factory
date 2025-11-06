use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct WorkflowExecution {
    pub id: Uuid,
    pub workflow_id: Uuid,
    pub task_id: Uuid,
    pub task_attempt_id: Option<Uuid>,
    pub current_station_id: Option<Uuid>,
    pub status: String, // 'pending', 'running', 'completed', 'failed', 'cancelled'
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateWorkflowExecution {
    pub workflow_id: Uuid,
    pub task_id: Uuid,
    pub task_attempt_id: Option<Uuid>,
    pub status: String,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateWorkflowExecution {
    pub current_station_id: Option<Uuid>,
    pub status: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

impl WorkflowExecution {
    /// Find all workflow executions for a workflow
    pub async fn find_by_workflow(
        pool: &SqlitePool,
        workflow_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            WorkflowExecution,
            r#"SELECT
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                task_id as "task_id!: Uuid",
                task_attempt_id as "task_attempt_id: Uuid",
                current_station_id as "current_station_id: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflow_executions
               WHERE workflow_id = $1
               ORDER BY created_at DESC"#,
            workflow_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find all workflow executions for a task
    pub async fn find_by_task(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            WorkflowExecution,
            r#"SELECT
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                task_id as "task_id!: Uuid",
                task_attempt_id as "task_attempt_id: Uuid",
                current_station_id as "current_station_id: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflow_executions
               WHERE task_id = $1
               ORDER BY created_at DESC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find workflow execution by task attempt
    pub async fn find_by_task_attempt(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            WorkflowExecution,
            r#"SELECT
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                task_id as "task_id!: Uuid",
                task_attempt_id as "task_attempt_id: Uuid",
                current_station_id as "current_station_id: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflow_executions
               WHERE task_attempt_id = $1
               ORDER BY created_at DESC
               LIMIT 1"#,
            task_attempt_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            WorkflowExecution,
            r#"SELECT
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                task_id as "task_id!: Uuid",
                task_attempt_id as "task_attempt_id: Uuid",
                current_station_id as "current_station_id: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflow_executions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateWorkflowExecution,
        execution_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            WorkflowExecution,
            r#"INSERT INTO workflow_executions (id, workflow_id, task_id, task_attempt_id, status)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                task_id as "task_id!: Uuid",
                task_attempt_id as "task_attempt_id: Uuid",
                current_station_id as "current_station_id: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            execution_id,
            data.workflow_id,
            data.task_id,
            data.task_attempt_id,
            data.status
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateWorkflowExecution,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let current_station_id = data.current_station_id.or(existing.current_station_id);
        let status = data.status.unwrap_or(existing.status);
        let started_at = data.started_at.or(existing.started_at);
        let completed_at = data.completed_at.or(existing.completed_at);

        sqlx::query_as!(
            WorkflowExecution,
            r#"UPDATE workflow_executions
               SET current_station_id = $2,
                   status = $3,
                   started_at = $4,
                   completed_at = $5,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                task_id as "task_id!: Uuid",
                task_attempt_id as "task_attempt_id: Uuid",
                current_station_id as "current_station_id: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            current_station_id,
            status,
            started_at,
            completed_at
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_status(
        pool: &SqlitePool,
        id: Uuid,
        status: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE workflow_executions SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            id,
            status
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM workflow_executions WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
