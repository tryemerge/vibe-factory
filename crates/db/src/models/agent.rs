use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Agent {
    pub id: Uuid,
    pub name: String,
    pub role: String,
    pub system_prompt: String,
    pub capabilities: Option<String>, // JSON array
    pub tools: Option<String>,        // JSON array
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateAgent {
    pub name: String,
    pub role: String,
    pub system_prompt: String,
    pub capabilities: Option<Vec<String>>,
    pub tools: Option<Vec<String>>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateAgent {
    pub name: Option<String>,
    pub role: Option<String>,
    pub system_prompt: Option<String>,
    pub capabilities: Option<Vec<String>>,
    pub tools: Option<Vec<String>>,
    pub description: Option<String>,
}

impl Agent {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Agent,
            r#"SELECT
                id as "id!: Uuid",
                name,
                role,
                system_prompt,
                capabilities,
                tools,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM agents
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Agent,
            r#"SELECT
                id as "id!: Uuid",
                name,
                role,
                system_prompt,
                capabilities,
                tools,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
               FROM agents
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: CreateAgent,
        agent_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let capabilities_json = data
            .capabilities
            .map(|caps| serde_json::to_string(&caps).ok())
            .flatten();
        let tools_json = data
            .tools
            .map(|tools| serde_json::to_string(&tools).ok())
            .flatten();

        sqlx::query_as!(
            Agent,
            r#"INSERT INTO agents (id, name, role, system_prompt, capabilities, tools, description)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING
                id as "id!: Uuid",
                name,
                role,
                system_prompt,
                capabilities,
                tools,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            agent_id,
            data.name,
            data.role,
            data.system_prompt,
            capabilities_json,
            tools_json,
            data.description
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: UpdateAgent,
    ) -> Result<Self, sqlx::Error> {
        // Get existing agent to preserve unchanged fields
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = data.name.unwrap_or(existing.name);
        let role = data.role.unwrap_or(existing.role);
        let system_prompt = data.system_prompt.unwrap_or(existing.system_prompt);
        let capabilities_json = data
            .capabilities
            .map(|caps| serde_json::to_string(&caps).ok())
            .flatten()
            .or(existing.capabilities);
        let tools_json = data
            .tools
            .map(|tools| serde_json::to_string(&tools).ok())
            .flatten()
            .or(existing.tools);
        let description = data.description.or(existing.description);

        sqlx::query_as!(
            Agent,
            r#"UPDATE agents
               SET name = $2, role = $3, system_prompt = $4, capabilities = $5, tools = $6, description = $7, updated_at = CURRENT_TIMESTAMP
               WHERE id = $1
               RETURNING
                id as "id!: Uuid",
                name,
                role,
                system_prompt,
                capabilities,
                tools,
                description,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            role,
            system_prompt,
            capabilities_json,
            tools_json,
            description
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM agents WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }
}
