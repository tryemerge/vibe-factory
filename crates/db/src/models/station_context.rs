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
    pub context_data: String, // JSON object with accumulated context
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateStationContext {
    pub task_id: Uuid,
    pub station_id: Uuid,
    pub context_data: String,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateStationContext {
    pub context_data: String,
}

impl StationContext {
    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationContext,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                context_data,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_context
               WHERE task_id = $1
               ORDER BY created_at ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_task_and_station(
        pool: &SqlitePool,
        task_id: Uuid,
        station_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationContext,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                context_data,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_context
               WHERE task_id = $1 AND station_id = $2"#,
            task_id,
            station_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateStationContext,
        context_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            StationContext,
            r#"INSERT INTO station_context (id, task_id, station_id, context_data)
               VALUES ($1, $2, $3, $4)
               RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                context_data,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            context_id,
            data.task_id,
            data.station_id,
            data.context_data
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        task_id: Uuid,
        station_id: Uuid,
        data: UpdateStationContext,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            StationContext,
            r#"UPDATE station_context
               SET context_data = $3, updated_at = CURRENT_TIMESTAMP
               WHERE task_id = $1 AND station_id = $2
               RETURNING
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                station_id as "station_id!: Uuid",
                context_data,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            task_id,
            station_id,
            data.context_data
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete<'e, E>(
        executor: E,
        task_id: Uuid,
        station_id: Uuid,
    ) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!(
            "DELETE FROM station_context WHERE task_id = $1 AND station_id = $2",
            task_id,
            station_id
        )
        .execute(executor)
        .await?;
        Ok(result.rows_affected())
    }
}
