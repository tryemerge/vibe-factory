use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{AppState, activity::ActivityEvent, db::activity::ActivityRepository};

#[derive(Debug, Deserialize)]
pub struct ActivityQuery {
    pub after: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub(super) struct ActivityResponse {
    data: Vec<ActivityEvent>,
}

pub(super) async fn get_activity_stream(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
    Query(params): Query<ActivityQuery>,
) -> Result<Json<ActivityResponse>, StatusCode> {
    let limit = params.limit.unwrap_or(200).clamp(1, 500);
    let repo = ActivityRepository::new(state.pool());

    let events = repo
        .fetch_since(org_id, params.after, limit as i64)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to load activity stream");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(ActivityResponse { data: events }))
}
