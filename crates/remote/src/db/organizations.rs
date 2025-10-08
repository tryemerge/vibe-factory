use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateOrganizationData {
    pub name: String,
    pub slug: Option<String>,
}

#[derive(Debug)]
pub enum OrganizationError {
    Conflict(String),
    Database(sqlx::Error),
}

impl From<sqlx::Error> for OrganizationError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

pub struct OrganizationRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> OrganizationRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        data: CreateOrganizationData,
    ) -> Result<Organization, OrganizationError> {
        let mut tx = self.pool.begin().await.map_err(OrganizationError::from)?;

        let organization = insert_organization(&mut tx, data).await?;

        tx.commit().await.map_err(OrganizationError::from)?;
        Ok(organization)
    }
}

async fn insert_organization(
    tx: &mut Tx<'_>,
    data: CreateOrganizationData,
) -> Result<Organization, OrganizationError> {
    let slug = data.slug.unwrap_or_else(|| generate_slug(&data.name));

    let organization = sqlx::query_as!(
        Organization,
        r#"
        INSERT INTO organizations (
            name,
            slug
        )
        VALUES ($1, $2)
        ON CONFLICT (slug) DO NOTHING
        RETURNING
            id          AS "id!",
            name        AS "name!",
            slug        AS "slug!",
            created_at  AS "created_at!",
            updated_at  AS "updated_at!"
        "#,
        data.name,
        slug
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(OrganizationError::from)?;

    organization
        .ok_or_else(|| OrganizationError::Conflict("organization slug already exists".to_string()))
}

fn generate_slug(name: &str) -> String {
    let fallback = format!("org-{}", Uuid::new_v4());
    let slug = name
        .trim()
        .to_lowercase()
        .replace(|c: char| !c.is_ascii_alphanumeric(), "-")
        .trim_matches('-')
        .to_string();

    if slug.is_empty() { fallback } else { slug }
}
