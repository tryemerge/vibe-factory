use axum::{
    Router,
    routing::{get, patch, post},
};
use tower_http::cors::CorsLayer;

use crate::AppState;

mod activity;
mod tasks;

pub fn router(state: AppState) -> Router {
    let api = Router::<AppState>::new()
        .route("/health", get(health))
        .route(
            "/v1/organizations/{org_id}/activity",
            get(activity::get_activity_stream),
        )
        .route(
            "/v1/organizations/{org_id}/tasks",
            post(tasks::create_shared_task),
        )
        .route("/v1/tasks/{task_id}", patch(tasks::update_shared_task))
        .route(
            "/v1/tasks/{task_id}/assign",
            post(tasks::transfer_assignment),
        );

    Router::<AppState>::new()
        .merge(api)
        .merge(crate::ws::router())
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}
