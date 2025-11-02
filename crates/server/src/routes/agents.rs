use axum::{
    Extension, Json, Router,
    extract::State,
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::get,
};
use db::models::agent::{Agent, CreateAgent, UpdateAgent};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_agent_middleware};

pub async fn get_agents(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Agent>>>, ApiError> {
    let agents = Agent::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(agents)))
}

pub async fn get_agent(
    Extension(agent): Extension<Agent>,
) -> Result<ResponseJson<ApiResponse<Agent>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(agent)))
}

pub async fn create_agent(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateAgent>,
) -> Result<ResponseJson<ApiResponse<Agent>>, ApiError> {
    let agent_id = Uuid::new_v4();
    let agent = Agent::create(&deployment.db().pool, payload, agent_id).await?;

    deployment
        .track_if_analytics_allowed(
            "agent_created",
            serde_json::json!({
                "agent_id": agent.id.to_string(),
                "agent_name": agent.name,
                "executor": agent.executor,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(agent)))
}

pub async fn update_agent(
    Extension(agent): Extension<Agent>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateAgent>,
) -> Result<ResponseJson<ApiResponse<Agent>>, ApiError> {
    let updated_agent = Agent::update(&deployment.db().pool, agent.id, payload).await?;

    deployment
        .track_if_analytics_allowed(
            "agent_updated",
            serde_json::json!({
                "agent_id": agent.id.to_string(),
                "agent_name": updated_agent.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_agent)))
}

pub async fn delete_agent(
    Extension(agent): Extension<Agent>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = Agent::delete(&deployment.db().pool, agent.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "agent_deleted",
                serde_json::json!({
                    "agent_id": agent.id.to_string(),
                }),
            )
            .await;

        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let agent_router = Router::new()
        .route("/", get(get_agent).put(update_agent).delete(delete_agent))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_agent_middleware,
        ));

    let inner = Router::new()
        .route("/", get(get_agents).post(create_agent))
        .nest("/{agent_id}", agent_router);

    Router::new().nest("/agents", inner)
}
