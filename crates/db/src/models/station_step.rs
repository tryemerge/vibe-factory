use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct StationStep {
    pub id: Uuid,
    pub station_id: Uuid,
    pub agent_id: Uuid,
    pub position: i64,
    pub step_prompt: Option<String>,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateStationStep {
    pub station_id: Uuid,
    pub agent_id: Uuid,
    pub position: i64,
    pub step_prompt: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateStationStep {
    pub agent_id: Option<Uuid>,
    pub position: Option<i64>,
    pub step_prompt: Option<String>,
    pub description: Option<String>,
}

impl StationStep {
    pub async fn find_by_station_id(
        pool: &SqlitePool,
        station_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationStep,
            r#"SELECT
                id as "id!: Uuid",
                station_id as "station_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                position,
                step_prompt,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_steps
               WHERE station_id = $1
               ORDER BY position ASC"#,
            station_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationStep,
            r#"SELECT
                id as "id!: Uuid",
                station_id as "station_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                position,
                step_prompt,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_steps
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateStationStep,
        step_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            StationStep,
            r#"INSERT INTO station_steps (id, station_id, agent_id, position, step_prompt, description)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING
                id as "id!: Uuid",
                station_id as "station_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                position,
                step_prompt,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            step_id,
            data.station_id,
            data.agent_id,
            data.position,
            data.step_prompt,
            data.description
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateStationStep,
    ) -> Result<Self, sqlx::Error> {
        // Get existing step to preserve unchanged fields
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let agent_id = data.agent_id.unwrap_or(existing.agent_id);
        let position = data.position.unwrap_or(existing.position);
        let step_prompt = data.step_prompt.or(existing.step_prompt);
        let description = data.description.or(existing.description);

        sqlx::query_as!(
            StationStep,
            r#"UPDATE station_steps
               SET agent_id = $2, position = $3, step_prompt = $4, description = $5, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                station_id as "station_id!: Uuid",
                agent_id as "agent_id!: Uuid",
                position,
                step_prompt,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            agent_id,
            position,
            step_prompt,
            description
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM station_steps WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
