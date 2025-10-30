use axum::{
    Router,
    extract::{Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use deployment::Deployment;
use serde::Deserialize;
use services::services::filesystem::{DirectoryEntry, DirectoryListResponse, FilesystemError};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct ListDirectoryQuery {
    path: Option<String>,
}

pub async fn list_directory(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListDirectoryQuery>,
) -> Result<ResponseJson<ApiResponse<DirectoryListResponse>>, ApiError> {
    match deployment.filesystem().list_directory(query.path).await {
        Ok(response) => Ok(ResponseJson(ApiResponse::success(response))),
        Err(FilesystemError::DirectoryDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("Directory does not exist")))
        }
        Err(FilesystemError::PathIsNotDirectory) => {
            Ok(ResponseJson(ApiResponse::error("Path is not a directory")))
        }
        Err(FilesystemError::Io(e)) => {
            tracing::error!("Failed to read directory: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to read directory: {}",
                e
            ))))
        }
    }
}

pub async fn list_git_repos(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListDirectoryQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<DirectoryEntry>>>, ApiError> {
    // Read timeout values from environment variables with sensible defaults
    let timeout_ms = std::env::var("GIT_SCAN_TIMEOUT_MS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5000); // Default: 5 seconds
    let hard_timeout_ms = std::env::var("GIT_SCAN_HARD_TIMEOUT_MS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10000); // Default: 10 seconds
    let max_depth = std::env::var("GIT_SCAN_MAX_DEPTH")
        .ok()
        .and_then(|s| s.parse().ok());

    let res = if let Some(ref path) = query.path {
        deployment
            .filesystem()
            .list_git_repos(Some(path.clone()), timeout_ms, hard_timeout_ms, max_depth)
            .await
    } else {
        deployment
            .filesystem()
            .list_common_git_repos(timeout_ms, hard_timeout_ms, max_depth.or(Some(4)))
            .await
    };
    match res {
        Ok(response) => Ok(ResponseJson(ApiResponse::success(response))),
        Err(FilesystemError::DirectoryDoesNotExist) => {
            Ok(ResponseJson(ApiResponse::error("Directory does not exist")))
        }
        Err(FilesystemError::PathIsNotDirectory) => {
            Ok(ResponseJson(ApiResponse::error("Path is not a directory")))
        }
        Err(FilesystemError::Io(e)) => {
            tracing::error!("Failed to read directory: {}", e);
            Ok(ResponseJson(ApiResponse::error(&format!(
                "Failed to read directory: {}",
                e
            ))))
        }
    }
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/filesystem/directory", get(list_directory))
        .route("/filesystem/git-repos", get(list_git_repos))
}
