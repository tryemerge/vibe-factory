use axum::{
    Router, middleware,
    routing::{delete, get, patch, post},
};
use tower_http::cors::CorsLayer;

use crate::{AppState, auth::require_clerk_session};

pub mod activity;
mod organizations;
mod tasks;
mod users;

pub fn router(state: AppState) -> Router {
    let api = Router::<AppState>::new()
        .route("/health", get(health))
        .route(
            "/v1/organizations",
            post(organizations::create_organization),
        )
        .route("/v1/users", post(users::create_user))
        .route(
            "/v1/users/{user_id}",
            get(users::get_user)
                .patch(users::update_user)
                .delete(users::delete_user),
        )
        .route(
            "/v1/organizations/{org_id}/members",
            get(users::list_members).post(users::add_member),
        )
        .route(
            "/v1/organizations/{org_id}/members/{member_id}",
            delete(users::delete_member),
        )
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
            post(tasks::transfer_task_assignment),
        );

    Router::<AppState>::new()
        .merge(api)
        .merge(crate::ws::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_clerk_session,
        ))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}
