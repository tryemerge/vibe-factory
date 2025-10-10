use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "org_member_role", rename_all = "lowercase")]
pub enum OrgMemberRole {
    Admin,
    Member,
}

impl OrgMemberRole {
    fn as_str(&self) -> &str {
        match self {
            OrgMemberRole::Admin => "admin",
            OrgMemberRole::Member => "member",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrganizationMember {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub role: OrgMemberRole,
    pub status: String,
    pub joined_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberWithUser {
    pub member: OrganizationMember,
    pub user: User,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateUserData {
    pub email: String,
    pub display_name: String,
    pub organization_id: Uuid,
    pub role: Option<OrgMemberRole>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUserData {
    pub email: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMembershipData {
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub role: Option<OrgMemberRole>,
    pub status: Option<String>,
}

#[derive(Debug)]
pub enum UserError {
    NotFound,
    Conflict(String),
    MembershipConstraint(String),
    Database(sqlx::Error),
}

impl From<sqlx::Error> for UserError {
    fn from(error: sqlx::Error) -> Self {
        match &error {
            sqlx::Error::RowNotFound => Self::NotFound,
            sqlx::Error::Database(db_err) if db_err.code().as_deref() == Some("23505") => {
                let message = match db_err.constraint() {
                    Some("users_email_key") => "user email already exists".to_string(),
                    Some("organization_members_organization_id_user_id_key") => {
                        "user is already a member of the organization".to_string()
                    }
                    Some(other) => {
                        format!("unique constraint violation: {other}")
                    }
                    None => "unique constraint violation".to_string(),
                };
                Self::Conflict(message)
            }
            _ => Self::Database(error),
        }
    }
}

pub struct UserRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> UserRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        data: CreateUserData,
    ) -> Result<(User, OrganizationMember), UserError> {
        let mut tx = self.pool.begin().await.map_err(UserError::from)?;

        let CreateUserData {
            email,
            display_name,
            organization_id,
            role,
            status,
        } = data;

        let user = sqlx::query_as!(
            User,
            r#"
            INSERT INTO users (email, display_name)
            VALUES ($1, $2)
            ON CONFLICT (email) DO NOTHING
            RETURNING
                id          AS "id!",
                email       AS "email!",
                display_name AS "display_name!",
                created_at  AS "created_at!",
                updated_at  AS "updated_at!"
            "#,
            email,
            display_name
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(UserError::from)?
        .ok_or_else(|| UserError::Conflict("user email already exists".to_string()))?;

        let member = insert_membership(
            &mut tx,
            CreateMembershipData {
                organization_id,
                user_id: user.id,
                role,
                status,
            },
        )
        .await?;

        tx.commit().await.map_err(UserError::from)?;
        Ok((user, member))
    }

    pub async fn find_by_id(&self, user_id: Uuid) -> Result<Option<User>, UserError> {
        sqlx::query_as!(
            User,
            r#"
            SELECT
                id AS "id!",
                email AS "email!",
                display_name AS "display_name!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            FROM users
            WHERE id = $1
            "#,
            user_id
        )
        .fetch_optional(self.pool)
        .await
        .map_err(UserError::from)
    }

    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>, UserError> {
        sqlx::query_as!(
            User,
            r#"
            SELECT
                id AS "id!",
                email AS "email!",
                display_name AS "display_name!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            FROM users
            WHERE email = $1
            "#,
            email
        )
        .fetch_optional(self.pool)
        .await
        .map_err(UserError::from)
    }

    pub async fn list_members_by_organization(
        &self,
        organization_id: Uuid,
    ) -> Result<Vec<MemberWithUser>, UserError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                m.id AS member_id,
                m.organization_id,
                m.user_id,
                m.role AS "member_role!: OrgMemberRole",
                m.status AS member_status,
                m.joined_at AS member_joined_at,
                m.last_seen_at AS member_last_seen_at,
                u.email AS user_email,
                u.display_name AS user_display_name,
                u.created_at AS user_created_at,
                u.updated_at AS user_updated_at
            FROM organization_members AS m
            JOIN users AS u ON u.id = m.user_id
            WHERE m.organization_id = $1
            ORDER BY u.display_name
            "#,
            organization_id
        )
        .fetch_all(self.pool)
        .await
        .map_err(UserError::from)?;

        let members = rows
            .into_iter()
            .map(|row| MemberWithUser {
                member: OrganizationMember {
                    id: row.member_id,
                    organization_id: row.organization_id,
                    user_id: row.user_id,
                    role: row.member_role,
                    status: row.member_status,
                    joined_at: row.member_joined_at,
                    last_seen_at: row.member_last_seen_at,
                },
                user: User {
                    id: row.user_id,
                    email: row.user_email,
                    display_name: row.user_display_name,
                    created_at: row.user_created_at,
                    updated_at: row.user_updated_at,
                },
            })
            .collect();

        Ok(members)
    }

    pub async fn add_membership(
        &self,
        data: CreateMembershipData,
    ) -> Result<OrganizationMember, UserError> {
        let mut tx = self.pool.begin().await.map_err(UserError::from)?;
        let member = insert_membership(&mut tx, data).await?;
        tx.commit().await.map_err(UserError::from)?;
        Ok(member)
    }

    pub async fn update(&self, user_id: Uuid, data: UpdateUserData) -> Result<User, UserError> {
        let mut tx = self.pool.begin().await.map_err(UserError::from)?;
        let email = data.email.as_deref();
        let display_name = data.display_name.as_deref();

        let updated = sqlx::query_as!(
            User,
            r#"
            UPDATE users
            SET email = COALESCE($2, email),
                display_name = COALESCE($3, display_name),
                updated_at = NOW()
            WHERE id = $1
            RETURNING
                id AS "id!",
                email AS "email!",
                display_name AS "display_name!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            "#,
            user_id,
            email,
            display_name
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(UserError::from)?
        .ok_or(UserError::NotFound)?;

        tx.commit().await.map_err(UserError::from)?;
        Ok(updated)
    }

    pub async fn delete(&self, user_id: Uuid) -> Result<(), UserError> {
        let result = sqlx::query!(
            r#"
            DELETE FROM users
            WHERE id = $1
            "#,
            user_id
        )
        .execute(self.pool)
        .await
        .map_err(UserError::from)?;

        if result.rows_affected() == 0 {
            return Err(UserError::NotFound);
        }

        Ok(())
    }

    pub async fn delete_membership(
        &self,
        organization_id: Uuid,
        member_id: Uuid,
    ) -> Result<(), UserError> {
        let mut tx = self.pool.begin().await.map_err(UserError::from)?;

        let membership = sqlx::query!(
            r#"
            SELECT id, user_id
            FROM organization_members
            WHERE id = $1
              AND organization_id = $2
            FOR UPDATE
            "#,
            member_id,
            organization_id
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(UserError::from)?;

        let membership = membership.ok_or(UserError::NotFound)?;

        let remaining = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*)::bigint AS "count!"
            FROM organization_members
            WHERE user_id = $1
            "#,
            membership.user_id
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(UserError::from)?;

        if remaining <= 1 {
            return Err(UserError::MembershipConstraint(
                "user must belong to at least one organization".to_string(),
            ));
        }

        sqlx::query!(
            r#"
            DELETE FROM organization_members
            WHERE id = $1
            "#,
            member_id
        )
        .execute(&mut *tx)
        .await
        .map_err(UserError::from)?;

        tx.commit().await.map_err(UserError::from)?;
        Ok(())
    }
}

async fn insert_membership(
    tx: &mut Tx<'_>,
    data: CreateMembershipData,
) -> Result<OrganizationMember, UserError> {
    let CreateMembershipData {
        organization_id,
        user_id,
        role,
        status,
    } = data;

    let role = role.unwrap_or(OrgMemberRole::Member);
    let status = status.unwrap_or_else(|| "active".to_string());

    sqlx::query_as!(
        OrganizationMember,
        r#"
        INSERT INTO organization_members (
            organization_id,
            user_id,
            role,
            status
        )
        VALUES ($1, $2, $3::text::org_member_role, $4)
        ON CONFLICT (organization_id, user_id) DO NOTHING
        RETURNING
            id AS "id!",
            organization_id AS "organization_id!",
            user_id AS "user_id!",
            role AS "role!: OrgMemberRole",
            status AS "status!",
            joined_at AS "joined_at!",
            last_seen_at AS "last_seen_at?"
        "#,
        organization_id,
        user_id,
        role.as_str(),
        status
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(UserError::from)?
    .ok_or_else(|| UserError::Conflict("user is already a member of the organization".to_string()))
}
