use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateUser {
    pub email: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateUser {
    pub email: Option<String>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
#[ts(rename = "User")]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }
}

impl User {
    pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            "SELECT id, email, created_at, updated_at FROM users WHERE email = $1",
            email
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_all(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            "SELECT id, email, created_at, updated_at FROM users ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            User,
            "SELECT id, email, created_at, updated_at FROM users WHERE id = $1",
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &PgPool,
        data: &CreateUser,
        user_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            User,
            "INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id, email, created_at, updated_at",
            user_id,
            data.email
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(pool: &PgPool, id: Uuid, email: String) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            User,
            "UPDATE users SET email = $2 WHERE id = $1 RETURNING id, email, created_at, updated_at",
            id,
            email
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM users WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
