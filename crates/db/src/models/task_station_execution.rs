use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskStationExecution {
    pub id: Uuid,
    pub task_id: Uuid,
    pub station_id: Uuid,
    pub status: String,  // 'pending', 'running', 'completed', 'failed'
    pub transition_taken_id: Option<Uuid>,  // Which transition was followed
    pub attempt_number: i64,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskStationExecution {
    pub task_id: Uuid,
    pub station_id: Uuid,
    pub status: String,
    pub attempt_number: i64,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTaskStationExecution {
    pub status: Option<String>,
    pub transition_taken_id: Option<Uuid>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

impl TaskStationExecution {
    /// Get execution history for task
    pub async fn find_by_task(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskStationExecution,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                status,
                transition_taken_id as "transition_taken_id: Uuid",
                attempt_number as "attempt_number!: i64",
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_station_executions
               WHERE task_id = $1
               ORDER BY created_at ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskStationExecution,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                status,
                transition_taken_id as "transition_taken_id: Uuid",
                attempt_number as "attempt_number!: i64",
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_station_executions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateTaskStationExecution,
        execution_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let attempt_number = data.attempt_number;

        sqlx::query_as!(
            TaskStationExecution,
            r#"INSERT INTO task_station_executions (id, task_id, station_id, status, attempt_number)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                status,
                transition_taken_id as "transition_taken_id: Uuid",
                attempt_number as "attempt_number!: i64",
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            execution_id,
            data.task_id,
            data.station_id,
            data.status,
            attempt_number
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateTaskStationExecution,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let status = data.status.unwrap_or(existing.status);
        let transition_taken_id = data.transition_taken_id.or(existing.transition_taken_id);
        let started_at = data.started_at.or(existing.started_at);
        let completed_at = data.completed_at.or(existing.completed_at);
        let error_message = data.error_message.or(existing.error_message);

        sqlx::query_as!(
            TaskStationExecution,
            r#"UPDATE task_station_executions
               SET status = $2,
                   transition_taken_id = $3,
                   started_at = $4,
                   completed_at = $5,
                   error_message = $6,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                status,
                transition_taken_id as "transition_taken_id: Uuid",
                attempt_number as "attempt_number!: i64",
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            status,
            transition_taken_id,
            started_at,
            completed_at,
            error_message
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_status(pool: &SqlitePool, id: Uuid, status: &str) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE task_station_executions SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
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
        let result = sqlx::query!("DELETE FROM task_station_executions WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
