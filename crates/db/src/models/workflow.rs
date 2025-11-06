use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::workflow_station::WorkflowStation;
use super::station_transition::StationTransition;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Workflow {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateWorkflow {
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateWorkflow {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WorkflowWithDetails {
    #[ts(flatten)]
    pub workflow: Workflow,
    pub stations: Vec<WorkflowStation>,
    pub transitions: Vec<StationTransition>,
}

impl Workflow {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Workflow,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                name,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflows
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Workflow,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                name,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflows
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Workflow,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                name,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflows
               WHERE project_id = $1
               ORDER BY created_at DESC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_and_name(
        pool: &SqlitePool,
        project_id: Uuid,
        name: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Workflow,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                name,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM workflows
               WHERE project_id = $1 AND name = $2"#,
            project_id,
            name
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateWorkflow,
        workflow_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Workflow,
            r#"INSERT INTO workflows (id, project_id, name, description)
               VALUES ($1, $2, $3, $4)
               RETURNING
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                name,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            workflow_id,
            data.project_id,
            data.name,
            data.description
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateWorkflow,
    ) -> Result<Self, sqlx::Error> {
        // Get existing workflow to preserve unchanged fields
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = data.name.unwrap_or(existing.name);
        let description = data.description.or(existing.description);

        sqlx::query_as!(
            Workflow,
            r#"UPDATE workflows
               SET name = $2, description = $3, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                name,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            description
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM workflows WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
