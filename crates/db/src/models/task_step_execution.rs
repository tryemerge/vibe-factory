use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display)]
#[sqlx(type_name = "task_step_execution_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum TaskStepExecutionStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskStepExecution {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub station_step_id: Uuid,
    pub agent_id: Uuid,
    pub status: TaskStepExecutionStatus,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskStepExecution {
    pub task_attempt_id: Uuid,
    pub station_step_id: Uuid,
    pub agent_id: Uuid,
    pub status: TaskStepExecutionStatus,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTaskStepExecution {
    pub status: Option<TaskStepExecutionStatus>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

impl TaskStepExecution {
    pub async fn find_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskStepExecution,
            r#"SELECT
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_step_id as "station_step_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status as "status!: TaskStepExecutionStatus",
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_step_executions
               WHERE task_attempt_id = $1
               ORDER BY created_at ASC"#,
            task_attempt_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskStepExecution,
            r#"SELECT
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_step_id as "station_step_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status as "status!: TaskStepExecutionStatus",
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_step_executions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_station_step_id(
        pool: &SqlitePool,
        station_step_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskStepExecution,
            r#"SELECT
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_step_id as "station_step_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status as "status!: TaskStepExecutionStatus",
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_step_executions
               WHERE station_step_id = $1
               ORDER BY created_at DESC"#,
            station_step_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateTaskStepExecution,
        execution_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let status = data.status;
        sqlx::query_as!(
            TaskStepExecution,
            r#"INSERT INTO task_step_executions (id, task_attempt_id, station_step_id, agent_id, status)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_step_id as "station_step_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status as "status!: TaskStepExecutionStatus",
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            execution_id,
            data.task_attempt_id,
            data.station_step_id,
            data.agent_id,
            status
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateTaskStepExecution,
    ) -> Result<Self, sqlx::Error> {
        // Get existing execution to preserve unchanged fields
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let status = data.status.unwrap_or(existing.status);
        let started_at = data.started_at.or(existing.started_at);
        let completed_at = data.completed_at.or(existing.completed_at);
        let error_message = data.error_message.or(existing.error_message);

        sqlx::query_as!(
            TaskStepExecution,
            r#"UPDATE task_step_executions
               SET status = $2, started_at = $3, completed_at = $4, error_message = $5, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_step_id as "station_step_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status as "status!: TaskStepExecutionStatus",
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            status,
            started_at,
            completed_at,
            error_message
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_status(
        pool: &SqlitePool,
        id: Uuid,
        status: TaskStepExecutionStatus,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE task_step_executions SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            id,
            status
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM task_step_executions WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
