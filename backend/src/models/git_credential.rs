use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::Type)]
#[ts(export)]
#[sqlx(type_name = "git_provider", rename_all = "lowercase")]
pub enum GitProvider {
    Github,
    Gitlab,
    Bitbucket,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, sqlx::Type)]
#[ts(export)]
#[sqlx(type_name = "git_credential_type", rename_all = "snake_case")]
pub enum GitCredentialType {
    Token,
    SshKey,
    OAuth,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct GitCredential {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub credential_type: GitCredentialType,
    pub encrypted_credential: String, // Never expose in API responses
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
#[ts(rename = "GitCredential")]
pub struct GitCredentialResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub credential_type: GitCredentialType,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateGitCredential {
    pub provider: String,
    pub credential_type: GitCredentialType,
    pub credential: String, // Plain text credential that will be encrypted
}

impl From<GitCredential> for GitCredentialResponse {
    fn from(credential: GitCredential) -> Self {
        Self {
            id: credential.id,
            user_id: credential.user_id,
            provider: credential.provider,
            credential_type: credential.credential_type,
            created_at: credential.created_at,
            updated_at: credential.updated_at,
        }
    }
}

impl GitCredential {
    // TODO: Implement encryption/decryption methods
    // These would use AES-256 with a key from environment variables
    pub fn encrypt_credential(_credential: &str) -> Result<String, String> {
        // Placeholder - implement actual encryption
        Ok("encrypted_placeholder".to_string())
    }
    
    pub fn decrypt_credential(&self) -> Result<String, String> {
        // Placeholder - implement actual decryption
        Ok("decrypted_placeholder".to_string())
    }
}
