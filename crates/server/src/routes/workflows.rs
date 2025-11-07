use axum::{
    Extension, Json, Router,
    extract::State,
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    workflow::{Workflow, CreateWorkflow, UpdateWorkflow},
    workflow_station::{WorkflowStation, CreateWorkflowStation, UpdateWorkflowStation},
    station_transition::{StationTransition, CreateStationTransition, UpdateStationTransition},
};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_workflow_middleware};

pub mod workflow_executions;

// ========================================
// Workflow Routes
// ========================================

pub async fn get_workflows(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<Workflow>>>, ApiError> {
    let workflows = Workflow::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(workflows)))
}

pub async fn get_workflows_by_project(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(project_id): axum::extract::Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<Workflow>>>, ApiError> {
    let workflows = Workflow::find_by_project_id(&deployment.db().pool, project_id).await?;
    Ok(ResponseJson(ApiResponse::success(workflows)))
}

pub async fn get_workflow(
    Extension(workflow): Extension<Workflow>,
) -> Result<ResponseJson<ApiResponse<Workflow>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(workflow)))
}

pub async fn create_workflow(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateWorkflow>,
) -> Result<ResponseJson<ApiResponse<Workflow>>, ApiError> {
    let workflow_id = Uuid::new_v4();
    let workflow = Workflow::create(&deployment.db().pool, payload, workflow_id).await?;

    deployment
        .track_if_analytics_allowed(
            "workflow_created",
            serde_json::json!({
                "workflow_id": workflow.id.to_string(),
                "workflow_name": workflow.name,
                "project_id": workflow.project_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(workflow)))
}

pub async fn update_workflow(
    Extension(workflow): Extension<Workflow>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateWorkflow>,
) -> Result<ResponseJson<ApiResponse<Workflow>>, ApiError> {
    let updated_workflow = Workflow::update(&deployment.db().pool, workflow.id, payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workflow_updated",
            serde_json::json!({
                "workflow_id": workflow.id.to_string(),
                "workflow_name": updated_workflow.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_workflow)))
}

pub async fn delete_workflow(
    Extension(workflow): Extension<Workflow>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = Workflow::delete(&deployment.db().pool, workflow.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "workflow_deleted",
                serde_json::json!({
                    "workflow_id": workflow.id.to_string(),
                }),
            )
            .await;

        Ok(ResponseJson(ApiResponse::success(())))
    }
}

// ========================================
// Station Routes
// ========================================

pub async fn get_stations_by_workflow(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(workflow_id): axum::extract::Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<WorkflowStation>>>, ApiError> {
    let stations = WorkflowStation::find_by_workflow_id(&deployment.db().pool, workflow_id).await?;
    Ok(ResponseJson(ApiResponse::success(stations)))
}

pub async fn get_station(
    Extension(station): Extension<WorkflowStation>,
) -> Result<ResponseJson<ApiResponse<WorkflowStation>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(station)))
}

pub async fn create_station(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateWorkflowStation>,
) -> Result<ResponseJson<ApiResponse<WorkflowStation>>, ApiError> {
    let station_id = Uuid::new_v4();
    let station = WorkflowStation::create(&deployment.db().pool, payload, station_id).await?;

    deployment
        .track_if_analytics_allowed(
            "workflow_station_created",
            serde_json::json!({
                "station_id": station.id.to_string(),
                "station_name": station.name,
                "workflow_id": station.workflow_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(station)))
}

pub async fn update_station(
    Extension(station): Extension<WorkflowStation>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateWorkflowStation>,
) -> Result<ResponseJson<ApiResponse<WorkflowStation>>, ApiError> {
    let updated_station = WorkflowStation::update(&deployment.db().pool, station.id, payload).await?;

    deployment
        .track_if_analytics_allowed(
            "workflow_station_updated",
            serde_json::json!({
                "station_id": station.id.to_string(),
                "station_name": updated_station.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_station)))
}

pub async fn delete_station(
    Extension(station): Extension<WorkflowStation>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = WorkflowStation::delete(&deployment.db().pool, station.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "workflow_station_deleted",
                serde_json::json!({
                    "station_id": station.id.to_string(),
                }),
            )
            .await;

        Ok(ResponseJson(ApiResponse::success(())))
    }
}

// ========================================
// Transition Routes
// ========================================

pub async fn get_transitions_by_workflow(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(workflow_id): axum::extract::Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<StationTransition>>>, ApiError> {
    let transitions = StationTransition::find_by_workflow_id(&deployment.db().pool, workflow_id).await?;
    Ok(ResponseJson(ApiResponse::success(transitions)))
}

pub async fn get_transition(
    Extension(transition): Extension<StationTransition>,
) -> Result<ResponseJson<ApiResponse<StationTransition>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(transition)))
}

pub async fn create_transition(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateStationTransition>,
) -> Result<ResponseJson<ApiResponse<StationTransition>>, ApiError> {
    let transition_id = Uuid::new_v4();
    let transition = StationTransition::create(&deployment.db().pool, payload, transition_id).await?;

    deployment
        .track_if_analytics_allowed(
            "station_transition_created",
            serde_json::json!({
                "transition_id": transition.id.to_string(),
                "workflow_id": transition.workflow_id.to_string(),
                "condition_type": transition.condition_type,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(transition)))
}

pub async fn update_transition(
    Extension(transition): Extension<StationTransition>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateStationTransition>,
) -> Result<ResponseJson<ApiResponse<StationTransition>>, ApiError> {
    let updated_transition = StationTransition::update(&deployment.db().pool, transition.id, payload).await?;

    deployment
        .track_if_analytics_allowed(
            "station_transition_updated",
            serde_json::json!({
                "transition_id": transition.id.to_string(),
                "condition_type": updated_transition.condition_type,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_transition)))
}

pub async fn delete_transition(
    Extension(transition): Extension<StationTransition>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = StationTransition::delete(&deployment.db().pool, transition.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "station_transition_deleted",
                serde_json::json!({
                    "transition_id": transition.id.to_string(),
                }),
            )
            .await;

        Ok(ResponseJson(ApiResponse::success(())))
    }
}

// ========================================
// Router
// ========================================

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    // Workflow ID-based routes with middleware
    let workflow_id_router = Router::new()
        .route("/execute", post(workflow_executions::execute_workflow))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_workflow_middleware,
        ));

    Router::new()
        // Workflows by project: GET/POST /projects/{project_id}/workflows (per spec)
        .route("/projects/{project_id}/workflows",
               get(get_workflows_by_project).post(create_workflow))
        // Stations by workflow: GET/POST /workflows/{workflow_id}/stations
        .route("/workflows/{workflow_id}/stations", get(get_stations_by_workflow).post(create_station))
        // Transitions by workflow: GET/POST /workflows/{workflow_id}/transitions
        .route("/workflows/{workflow_id}/transitions", get(get_transitions_by_workflow).post(create_transition))
        // Workflow execution: POST /workflows/{workflow_id}/execute
        .nest("/workflows/{id}", workflow_id_router)
        // Workflow execution monitoring endpoints
        .route("/workflow-executions/{id}", get(workflow_executions::get_workflow_execution))
        .route("/workflow-executions/{id}/stations", get(workflow_executions::get_workflow_execution_stations))
        .route("/workflow-executions/{id}/cancel", post(workflow_executions::cancel_workflow_execution))
        .route("/workflow-executions/{id}/retry-station", post(workflow_executions::retry_station_execution))
}
