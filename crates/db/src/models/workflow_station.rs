use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct WorkflowStation {
    pub id: Uuid,
    pub workflow_id: Uuid,
    pub name: String,
    pub position: i64,
    pub description: Option<String>,
    pub x_position: f64,
    pub y_position: f64,
    pub agent_id: Option<Uuid>, // Phase 1.1: One agent per station
    pub step_prompt: Option<String>, // Phase 1.1: Instructions for this station's agent
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateWorkflowStation {
    pub workflow_id: Uuid,
    pub name: String,
    pub position: i64,
    pub description: Option<String>,
    pub x_position: Option<f64>,
    pub y_position: Option<f64>,
    pub agent_id: Option<Uuid>,
    pub step_prompt: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateWorkflowStation {
    pub name: Option<String>,
    pub position: Option<i64>,
    pub description: Option<String>,
    pub x_position: Option<f64>,
    pub y_position: Option<f64>,
    pub agent_id: Option<Uuid>,
    pub step_prompt: Option<String>,
}

impl WorkflowStation {
    pub async fn find_by_workflow_id(
        pool: &SqlitePool,
        workflow_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            WorkflowStation,
            r#"SELECT
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                name,
                position,
                description,
                x_position,
                y_position,
                agent_id as "agent_id: Uuid",
                step_prompt,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflow_stations
               WHERE workflow_id = $1
               ORDER BY position ASC"#,
            workflow_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            WorkflowStation,
            r#"SELECT
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                name,
                position,
                description,
                x_position,
                y_position,
                agent_id as "agent_id: Uuid",
                step_prompt,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflow_stations
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateWorkflowStation,
        station_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let x_position = data.x_position.unwrap_or(0.0);
        let y_position = data.y_position.unwrap_or(0.0);

        sqlx::query_as!(
            WorkflowStation,
            r#"INSERT INTO workflow_stations (id, workflow_id, name, position, description, x_position, y_position, agent_id, step_prompt)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                name,
                position,
                description,
                x_position,
                y_position,
                agent_id as "agent_id: Uuid",
                step_prompt,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            station_id,
            data.workflow_id,
            data.name,
            data.position,
            data.description,
            x_position,
            y_position,
            data.agent_id,
            data.step_prompt
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateWorkflowStation,
    ) -> Result<Self, sqlx::Error> {
        // Get existing station to preserve unchanged fields
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = data.name.unwrap_or(existing.name);
        let position = data.position.unwrap_or(existing.position);
        let description = data.description.or(existing.description);
        let x_position = data.x_position.unwrap_or(existing.x_position);
        let y_position = data.y_position.unwrap_or(existing.y_position);
        let agent_id = data.agent_id.or(existing.agent_id);
        let step_prompt = data.step_prompt.or(existing.step_prompt);

        sqlx::query_as!(
            WorkflowStation,
            r#"UPDATE workflow_stations
               SET name = $2, position = $3, description = $4, x_position = $5, y_position = $6, agent_id = $7, step_prompt = $8, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                workflow_id as "workflow_id!: Uuid",
                name,
                position,
                description,
                x_position,
                y_position,
                agent_id as "agent_id: Uuid",
                step_prompt,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            position,
            description,
            x_position,
            y_position,
            agent_id,
            step_prompt
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM workflow_stations WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
