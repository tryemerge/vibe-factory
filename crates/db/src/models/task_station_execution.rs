use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskStationExecution {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub station_id: Uuid,
    pub agent_id: Uuid,
    pub status: String, // 'pending', 'running', 'completed', 'failed'
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub output_context: Option<String>, // JSON output from this station's execution
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskStationExecution {
    pub task_attempt_id: Uuid,
    pub station_id: Uuid,
    pub agent_id: Uuid,
    pub status: String,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTaskStationExecution {
    pub status: String,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub output_context: Option<String>,
}

impl TaskStationExecution {
    pub async fn find_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskStationExecution,
            r#"SELECT
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_id as "station_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                output_context,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_station_executions
               WHERE task_attempt_id = $1
               ORDER BY created_at ASC"#,
            task_attempt_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskStationExecution,
            r#"SELECT
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_id as "station_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                output_context,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_station_executions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_station_id(
        pool: &SqlitePool,
        station_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskStationExecution,
            r#"SELECT
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_id as "station_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                output_context,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_station_executions
               WHERE station_id = $1
               ORDER BY created_at DESC"#,
            station_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateTaskStationExecution,
        execution_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            TaskStationExecution,
            r#"INSERT INTO task_station_executions (id, task_attempt_id, station_id, agent_id, status)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_id as "station_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                output_context,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            execution_id,
            data.task_attempt_id,
            data.station_id,
            data.agent_id,
            data.status
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateTaskStationExecution,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            TaskStationExecution,
            r#"UPDATE task_station_executions
               SET status = $2, started_at = $3, completed_at = $4, error_message = $5, output_context = $6, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                station_id as "station_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                status,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                error_message,
                output_context,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.status,
            data.started_at,
            data.completed_at,
            data.error_message,
            data.output_context
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
