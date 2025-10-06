use axum::{
    Router,
    extract::{Query, State, ws::WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::AppState;

mod message;
mod session;

#[derive(Debug, Deserialize, Clone)]
pub struct WsQueryParams {
    pub organization_id: Uuid,
    pub cursor: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/v1/ws", get(upgrade))
}

async fn upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(params): Query<WsQueryParams>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| session::handle(socket, state, params))
}
