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
        CreateTaskData, TaskError, TaskRepository, TransferAssignmentData, UpdateTaskData,
    },
};

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub assignee_member_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub version: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct TransferAssignmentRequest {
    pub new_assignee_member_id: Uuid,
    pub previous_assignee_member_id: Option<Uuid>,
    pub version: Option<i64>,
}

pub async fn create_shared_task(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<CreateTaskRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = TaskRepository::new(state.pool());
    let data = CreateTaskData {
        title: payload.title,
        description: payload.description,
        assignee_member_id: payload.assignee_member_id,
    };

    match repo.create(org_id, data).await {
        Ok(task) => (StatusCode::CREATED, Json(json!({ "task": task }))),
        Err(error) => task_error_response(error, "failed to create shared task"),
    }
}

pub async fn update_shared_task(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<UpdateTaskRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = TaskRepository::new(state.pool());
    let data = UpdateTaskData {
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

pub async fn transfer_assignment(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    Json(payload): Json<TransferAssignmentRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = TaskRepository::new(state.pool());
    let data = TransferAssignmentData {
        new_assignee_member_id: payload.new_assignee_member_id,
        previous_assignee_member_id: payload.previous_assignee_member_id,
        version: payload.version,
    };

    match repo.transfer_assignment(task_id, data).await {
        Ok(task) => (StatusCode::OK, Json(json!({ "task": task }))),
        Err(error) => task_error_response(error, "failed to transfer task assignment"),
    }
}

fn task_error_response(error: TaskError, context: &str) -> (StatusCode, Json<serde_json::Value>) {
    match error {
        TaskError::NotFound => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "task not found" })),
        ),
        TaskError::Conflict(message) => (StatusCode::CONFLICT, Json(json!({ "error": message }))),
        TaskError::Database(err) => {
            tracing::error!(?err, "{context}", context = context);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
    }
}
