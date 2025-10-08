use axum::{Json, http::StatusCode};
use serde::Deserialize;
use serde_json::json;

use crate::{
    AppState,
    db::organizations::{CreateOrganizationData, OrganizationError, OrganizationRepository},
};

#[derive(Debug, Deserialize)]
pub struct CreateOrganizationRequest {
    pub name: String,
    pub slug: Option<String>,
}

pub async fn create_organization(
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(payload): Json<CreateOrganizationRequest>,
) -> (StatusCode, Json<serde_json::Value>) {
    let repo = OrganizationRepository::new(state.pool());
    let data = CreateOrganizationData {
        name: payload.name,
        slug: payload.slug,
    };

    match repo.create(data).await {
        Ok(organization) => (
            StatusCode::CREATED,
            Json(json!({ "organization": organization })),
        ),
        Err(error) => organization_error_response(error),
    }
}

fn organization_error_response(error: OrganizationError) -> (StatusCode, Json<serde_json::Value>) {
    match error {
        OrganizationError::Conflict(message) => {
            (StatusCode::CONFLICT, Json(json!({ "error": message })))
        }
        OrganizationError::Database(err) => {
            tracing::error!(?err, "failed to create organization");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
    }
}
