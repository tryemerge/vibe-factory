use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{AppState, activity::ActivityResponse, db::activity::ActivityRepository};

#[derive(Debug, Deserialize)]
pub struct ActivityQuery {
    /// Fetch events after this ID (exclusive)
    pub after: Option<i64>,
    /// Maximum number of events to return
    pub limit: Option<i64>,
}

pub(super) async fn get_activity_stream(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
    Query(params): Query<ActivityQuery>,
) -> Result<Json<ActivityResponse>, StatusCode> {
    let config = state.config();
    let limit = params
        .limit
        .unwrap_or(config.activity_default_limit)
        .clamp(1, config.activity_max_limit);
    let repo = ActivityRepository::new(state.pool());

    let events = repo
        .fetch_since(org_id, params.after, limit)
        .await
        .map_err(|error| {
            tracing::error!(?error, "failed to load activity stream");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(ActivityResponse { data: events }))
}
