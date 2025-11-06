use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct StationExecution {
    pub id: Uuid,
    pub workflow_execution_id: Uuid,
    pub station_id: Uuid,
    pub execution_process_id: Option<Uuid>,
    pub status: String, // 'pending', 'running', 'completed', 'failed', 'skipped'
    pub output_data: Option<String>, // JSON data for station output_context_keys
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateStationExecution {
    pub workflow_execution_id: Uuid,
    pub station_id: Uuid,
    pub status: String,
    pub execution_process_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateStationExecution {
    pub execution_process_id: Option<Uuid>,
    pub status: Option<String>,
    pub output_data: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

impl StationExecution {
    /// Find all station executions for a workflow execution
    pub async fn find_by_workflow_execution(
        pool: &SqlitePool,
        workflow_execution_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationExecution,
            r#"SELECT
                id as "id!: Uuid",
                workflow_execution_id as "workflow_execution_id!: Uuid",
                station_id as "station_id!: Uuid",
                execution_process_id as "execution_process_id: Uuid",
                status,
                output_data,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_executions
               WHERE workflow_execution_id = $1
               ORDER BY created_at ASC"#,
            workflow_execution_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find station executions for a specific station
    pub async fn find_by_station(
        pool: &SqlitePool,
        station_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationExecution,
            r#"SELECT
                id as "id!: Uuid",
                workflow_execution_id as "workflow_execution_id!: Uuid",
                station_id as "station_id!: Uuid",
                execution_process_id as "execution_process_id: Uuid",
                status,
                output_data,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_executions
               WHERE station_id = $1
               ORDER BY created_at DESC"#,
            station_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find station execution by execution process
    pub async fn find_by_execution_process(
        pool: &SqlitePool,
        execution_process_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationExecution,
            r#"SELECT
                id as "id!: Uuid",
                workflow_execution_id as "workflow_execution_id!: Uuid",
                station_id as "station_id!: Uuid",
                execution_process_id as "execution_process_id: Uuid",
                status,
                output_data,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_executions
               WHERE execution_process_id = $1
               ORDER BY created_at DESC
               LIMIT 1"#,
            execution_process_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationExecution,
            r#"SELECT
                id as "id!: Uuid",
                workflow_execution_id as "workflow_execution_id!: Uuid",
                station_id as "station_id!: Uuid",
                execution_process_id as "execution_process_id: Uuid",
                status,
                output_data,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_executions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateStationExecution,
        execution_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            StationExecution,
            r#"INSERT INTO station_executions (id, workflow_execution_id, station_id, execution_process_id, status)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING
                id as "id!: Uuid",
                workflow_execution_id as "workflow_execution_id!: Uuid",
                station_id as "station_id!: Uuid",
                execution_process_id as "execution_process_id: Uuid",
                status,
                output_data,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            execution_id,
            data.workflow_execution_id,
            data.station_id,
            data.execution_process_id,
            data.status
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateStationExecution,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let execution_process_id = data.execution_process_id.or(existing.execution_process_id);
        let status = data.status.unwrap_or(existing.status);
        let output_data = data.output_data.or(existing.output_data);
        let started_at = data.started_at.or(existing.started_at);
        let completed_at = data.completed_at.or(existing.completed_at);

        sqlx::query_as!(
            StationExecution,
            r#"UPDATE station_executions
               SET execution_process_id = $2,
                   status = $3,
                   output_data = $4,
                   started_at = $5,
                   completed_at = $6,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                workflow_execution_id as "workflow_execution_id!: Uuid",
                station_id as "station_id!: Uuid",
                execution_process_id as "execution_process_id: Uuid",
                status,
                output_data,
                started_at as "started_at: DateTime<Utc>",
                completed_at as "completed_at: DateTime<Utc>",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            execution_process_id,
            status,
            output_data,
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
            "UPDATE station_executions SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            id,
            status
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM station_executions WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
