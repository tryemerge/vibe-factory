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
    db::tasks::{
        CreateSharedTaskData, SharedTaskError, SharedTaskRepository, TransferTaskAssignmentData,
        UpdateSharedTaskData,
    },
};

#[derive(Debug, Deserialize)]
pub struct CreateSharedTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub assignee_member_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSharedTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub version: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct TransferSharedTaskAssignmentRequest {
    pub new_assignee_member_id: Uuid,
    pub previous_assignee_member_id: Option<Uuid>,
    pub version: Option<i64>,
}

pub async fn create_shared_task(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<CreateSharedTaskRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = SharedTaskRepository::new(state.pool());
    let data = CreateSharedTaskData {
        title: payload.title,
        description: payload.description,
        assignee_member_id: payload.assignee_member_id,
    };

    dbg!("Recevied create_shared_task request:", &data);

    match repo.create(org_id, data).await {
        Ok(task) => (StatusCode::CREATED, Json(json!({ "task": task }))),
        Err(error) => task_error_response(error, "failed to create shared task"),
    }
}

pub async fn update_shared_task(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<UpdateSharedTaskRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = SharedTaskRepository::new(state.pool());
    let data = UpdateSharedTaskData {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        version: payload.version,
    };

    match repo.update(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(json!({ "task": task }))),
        Err(error) => task_error_response(error, "failed to update shared task"),
    }
}

pub async fn transfer_task_assignment(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<TransferSharedTaskAssignmentRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = SharedTaskRepository::new(state.pool());
    let data = TransferTaskAssignmentData {
        new_assignee_member_id: payload.new_assignee_member_id,
        previous_assignee_member_id: payload.previous_assignee_member_id,
        version: payload.version,
    };

    match repo.transfer_task_assignment(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(json!({ "task": task }))),
        Err(error) => task_error_response(error, "failed to transfer task assignment"),
    }
}

fn task_error_response(
    error: SharedTaskError,
    context: &str,
) -> (StatusCode, Json<serde_json::Value>) {
    match error {
        SharedTaskError::NotFound => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "task not found" })),
        ),
        SharedTaskError::Conflict(message) => {
            (StatusCode::CONFLICT, Json(json!({ "error": message })))
        }
        SharedTaskError::Database(err) => {
            tracing::error!(?err, "{context}", context = context);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
    }
}
