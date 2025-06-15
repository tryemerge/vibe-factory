use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;
use uuid::Uuid;

use super::git_credential::GitProvider;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Uuid, // Foreign key to User
    pub repo_url: String,
    pub repo_provider: GitProvider,
    pub git_credential_id: Option<Uuid>, // Foreign key to GitCredential
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateProject {
    pub name: String,
    pub repo_url: String,
    pub repo_provider: GitProvider,
    pub git_credential_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub repo_url: Option<String>,
    pub repo_provider: Option<GitProvider>,
    pub git_credential_id: Option<Option<Uuid>>, // Option<Option<>> to allow setting to NULL
}
