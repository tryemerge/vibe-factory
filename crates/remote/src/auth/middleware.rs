use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Authorization, HeaderMapExt, authorization::Bearer};
use tracing::warn;

use crate::AppState;

pub async fn require_clerk_session(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Response {
    let bearer = match req.headers().typed_get::<Authorization<Bearer>>() {
        Some(Authorization(bearer)) => bearer,
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let auth = state.auth();
    match auth.verify(bearer.token()).await {
        Ok(identity) => {
            req.extensions_mut().insert(identity);
            next.run(req).await
        }
        Err(err) => {
            warn!(?err, "failed to verify Clerk session");
            StatusCode::UNAUTHORIZED.into_response()
        }
    }
}
