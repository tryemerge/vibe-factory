use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::{
    AppState,
    db::users::{
        CreateMembershipData, CreateUserData, MemberWithUser, OrgMemberRole, UpdateUserData,
        UserError, UserRepository,
    },
};

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub display_name: String,
    pub organization_id: Uuid,
    pub role: Option<OrgMemberRole>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub email: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddMemberRequest {
    pub user_id: Uuid,
    pub role: Option<OrgMemberRole>,
    pub status: Option<String>,
}

pub async fn create_user(
    State(state): State<AppState>,
    Json(payload): Json<CreateUserRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = UserRepository::new(state.pool());
    let data = CreateUserData {
        email: payload.email,
        display_name: payload.display_name,
        organization_id: payload.organization_id,
        role: payload.role,
        status: payload.status,
    };

    match repo.create(data).await {
        Ok((user, membership)) => (
            StatusCode::CREATED,
            Json(json!({ "user": user, "membership": membership })),
        ),
        Err(error) => user_error_response(error, "user not found"),
    }
}

pub async fn get_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let repo = UserRepository::new(state.pool());

    match repo.find_by_id(user_id).await {
        Ok(Some(user)) => Ok(Json(json!({ "user": user }))),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(UserError::Database(err)) => {
            tracing::error!(?err, "failed to load user");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
        Err(_) => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn update_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(payload): Json<UpdateUserRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    if payload.email.is_none() && payload.display_name.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "no fields provided" })),
        );
    }

    let repo = UserRepository::new(state.pool());
    let data = UpdateUserData {
        email: payload.email,
        display_name: payload.display_name,
    };

    match repo.update(user_id, data).await {
        Ok(user) => (StatusCode::OK, Json(json!({ "user": user }))),
        Err(error) => user_error_response(error, "user not found"),
    }
}

pub async fn delete_user(State(state): State<AppState>, Path(user_id): Path<Uuid>) -> StatusCode {
    let repo = UserRepository::new(state.pool());
    match repo.delete(user_id).await {
        Ok(()) => StatusCode::NO_CONTENT,
        Err(UserError::NotFound) => StatusCode::NOT_FOUND,
        Err(UserError::Database(err)) => {
            tracing::error!(?err, "failed to delete user");
            StatusCode::INTERNAL_SERVER_ERROR
        }
        Err(_) => StatusCode::BAD_REQUEST,
    }
}

pub async fn list_members(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = UserRepository::new(state.pool());
    match repo.list_members_by_organization(org_id).await {
        Ok(members) => (
            StatusCode::OK,
            Json(json!({ "members": members_into_payload(members) })),
        ),
        Err(UserError::Database(err)) => {
            tracing::error!(?err, "failed to list organization members");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
        Err(_) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "failed to list members" })),
        ),
    }
}

pub async fn add_member(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<AddMemberRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = UserRepository::new(state.pool());
    let data = CreateMembershipData {
        organization_id: org_id,
        user_id: payload.user_id,
        role: payload.role,
        status: payload.status,
    };

    match repo.add_membership(data).await {
        Ok(member) => (StatusCode::CREATED, Json(json!({ "membership": member }))),
        Err(error) => user_error_response(error, "membership not found"),
    }
}

pub async fn delete_member(
    State(state): State<AppState>,
    Path((org_id, member_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = UserRepository::new(state.pool());
    match repo.delete_membership(org_id, member_id).await {
        Ok(()) => (StatusCode::NO_CONTENT, Json(json!({}))),
        Err(error) => user_error_response(error, "membership not found"),
    }
}

fn user_error_response(
    error: UserError,
    not_found_message: &'static str,
) -> (StatusCode, Json<serde_json::Value>) {
    match error {
        UserError::NotFound => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": not_found_message })),
        ),
        UserError::Conflict(message) | UserError::MembershipConstraint(message) => {
            (StatusCode::CONFLICT, Json(json!({ "error": message })))
        }
        UserError::Database(err) => {
            tracing::error!(?err, "user operation failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
    }
}

fn members_into_payload(members: Vec<MemberWithUser>) -> Vec<serde_json::Value> {
    members
        .into_iter()
        .map(|MemberWithUser { member, user }| json!({ "member": member, "user": user }))
        .collect()
}
