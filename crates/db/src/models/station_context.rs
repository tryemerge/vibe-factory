use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct StationContext {
    pub id: Uuid,
    pub task_id: Uuid,
    pub station_id: Uuid,
    pub context_key: String,  // e.g., "design_doc", "test_results"
    pub context_value: String,  // File path, JSON data, or text
    pub context_type: String,  // 'file', 'decision', 'artifact'
    pub created_by_agent_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateStationContext {
    pub task_id: Uuid,
    pub station_id: Uuid,
    pub context_key: String,
    pub context_value: String,
    pub context_type: String,
    pub created_by_agent_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateStationContext {
    pub context_value: Option<String>,
}

impl StationContext {
    /// Get all context for a task (ordered by station position)
    pub async fn find_by_task(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationContext,
            r#"SELECT
                sc.id as "id!: Uuid",
                sc.task_id as "task_id!: Uuid",
                sc.station_id as "station_id!: Uuid",
                sc.context_key as "context_key!: String",
                sc.context_value as "context_value!: String",
                sc.context_type as "context_type!: String",
                sc.created_by_agent_id as "created_by_agent_id: Uuid",
                sc.created_at as "created_at!: DateTime<Utc>"
               FROM station_context sc
               JOIN workflow_stations ws ON sc.station_id = ws.id
               WHERE sc.task_id = $1
               ORDER BY ws.position ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    /// Get context for specific station
    pub async fn find_by_task_and_station(
        pool: &SqlitePool,
        task_id: Uuid,
        station_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationContext,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                context_key as "context_key!: String",
                context_value as "context_value!: String",
                context_type as "context_type!: String",
                created_by_agent_id as "created_by_agent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>"
               FROM station_context
               WHERE task_id = $1 AND station_id = $2"#,
            task_id,
            station_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationContext,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                context_key as "context_key!: String",
                context_value as "context_value!: String",
                context_type as "context_type!: String",
                created_by_agent_id as "created_by_agent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>"
               FROM station_context
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create context entry (upsert on conflict)
    pub async fn create(
        pool: &SqlitePool,
        data: CreateStationContext,
        context_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            StationContext,
            r#"INSERT INTO station_context (id, task_id, station_id, context_key, context_value, context_type, created_by_agent_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT(task_id, station_id, context_key) DO UPDATE SET
                   context_value = excluded.context_value
               RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                context_key as "context_key!: String",
                context_value as "context_value!: String",
                context_type as "context_type!: String",
                created_by_agent_id as "created_by_agent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>""#,
            context_id,
            data.task_id,
            data.station_id,
            data.context_key,
            data.context_value,
            data.context_type,
            data.created_by_agent_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateStationContext,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let context_value = data.context_value.unwrap_or(existing.context_value);

        sqlx::query_as!(
            StationContext,
            r#"UPDATE station_context
               SET context_value = $2
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                context_key as "context_key!: String",
                context_value as "context_value!: String",
                context_type as "context_type!: String",
                created_by_agent_id as "created_by_agent_id: Uuid",
                created_at as "created_at!: DateTime<Utc>""#,
            id,
            context_value
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM station_context WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
