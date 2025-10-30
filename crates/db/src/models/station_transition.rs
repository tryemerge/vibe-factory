use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct StationTransition {
    pub id: Uuid,
    pub workflow_id: Uuid,
    pub source_station_id: Uuid,
    pub target_station_id: Uuid,
    pub condition: Option<String>, // Future: conditional logic (JSON)
    pub label: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateStationTransition {
    pub workflow_id: Uuid,
    pub source_station_id: Uuid,
    pub target_station_id: Uuid,
    pub condition: Option<String>,
    pub label: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateStationTransition {
    pub condition: Option<String>,
    pub label: Option<String>,
}

impl StationTransition {
    pub async fn find_by_workflow_id(
        pool: &SqlitePool,
        workflow_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationTransition,
            r#"SELECT
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                source_station_id as "source_station_id!: Uuid",
                target_station_id as "target_station_id!: Uuid",
                condition,
                label,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_transitions
               WHERE workflow_id = $1
               ORDER BY created_at ASC"#,
            workflow_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationTransition,
            r#"SELECT
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                source_station_id as "source_station_id!: Uuid",
                target_station_id as "target_station_id!: Uuid",
                condition,
                label,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_transitions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_source_station(
        pool: &SqlitePool,
        source_station_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            StationTransition,
            r#"SELECT
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                source_station_id as "source_station_id!: Uuid",
                target_station_id as "target_station_id!: Uuid",
                condition,
                label,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM station_transitions
               WHERE source_station_id = $1
               ORDER BY created_at ASC"#,
            source_station_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateStationTransition,
        transition_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            StationTransition,
            r#"INSERT INTO station_transitions (id, workflow_id, source_station_id, target_station_id, condition, label)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                source_station_id as "source_station_id!: Uuid",
                target_station_id as "target_station_id!: Uuid",
                condition,
                label,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            transition_id,
            data.workflow_id,
            data.source_station_id,
            data.target_station_id,
            data.condition,
            data.label
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateStationTransition,
    ) -> Result<Self, sqlx::Error> {
        // Get existing transition to preserve unchanged fields
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let condition = data.condition.or(existing.condition);
        let label = data.label.or(existing.label);

        sqlx::query_as!(
            StationTransition,
            r#"UPDATE station_transitions
               SET condition = $2, label = $3, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                source_station_id as "source_station_id!: Uuid",
                target_station_id as "target_station_id!: Uuid",
                condition,
                label,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            condition,
            label
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM station_transitions WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
