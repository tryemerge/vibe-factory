use axum::{
    extract::{Extension, Path},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
    Json, Router,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{
    user::{CreateUser, UpdateUser, User, UserResponse},
    ApiResponse,
};

pub async fn get_users(
    Extension(pool): Extension<PgPool>,
) -> Result<ResponseJson<ApiResponse<Vec<UserResponse>>>, StatusCode> {
    match User::find_all(&pool).await {
        Ok(users) => {
            let user_responses: Vec<UserResponse> = users.into_iter().map(|u| u.into()).collect();
            Ok(ResponseJson(ApiResponse {
                success: true,
                data: Some(user_responses),
                message: None,
            }))
        }
        Err(e) => {
            tracing::error!("Failed to fetch users: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_user(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<PgPool>,
) -> Result<ResponseJson<ApiResponse<UserResponse>>, StatusCode> {
    match User::find_by_id(&pool, id).await {
        Ok(Some(user)) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(user.into()),
            message: None,
        })),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to fetch user: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn create_user(
    Extension(pool): Extension<PgPool>,
    Json(payload): Json<CreateUser>,
) -> Result<ResponseJson<ApiResponse<UserResponse>>, StatusCode> {
    let id = Uuid::new_v4();

    match User::create(&pool, &payload, id).await {
        Ok(user) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(user.into()),
            message: Some("User created successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to create user: {}", e);
            if e.to_string().contains("users_email_key") {
                Err(StatusCode::CONFLICT) // Email already exists
            } else {
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }
}

pub async fn update_user(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<PgPool>,
    Json(payload): Json<UpdateUser>,
) -> Result<ResponseJson<ApiResponse<UserResponse>>, StatusCode> {
    // Get existing user
    let existing_user = match User::find_by_id(&pool, id).await {
        Ok(Some(user)) => user,
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("Failed to check user existence: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    };

    let email = payload.email.unwrap_or(existing_user.email);

    match User::update(&pool, id, email).await {
        Ok(user) => Ok(ResponseJson(ApiResponse {
            success: true,
            data: Some(user.into()),
            message: Some("User updated successfully".to_string()),
        })),
        Err(e) => {
            tracing::error!("Failed to update user: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn delete_user(
    Path(id): Path<Uuid>,
    Extension(pool): Extension<PgPool>,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    match User::delete(&pool, id).await {
        Ok(rows_affected) => {
            if rows_affected == 0 {
                Err(StatusCode::NOT_FOUND)
            } else {
                Ok(ResponseJson(ApiResponse {
                    success: true,
                    data: None,
                    message: Some("User deleted successfully".to_string()),
                }))
            }
        }
        Err(e) => {
            tracing::error!("Failed to delete user: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub fn users_router() -> Router {
    Router::new()
        .route("/users", get(get_users).post(create_user))
        .route(
            "/users/:id",
            get(get_user).put(update_user).delete(delete_user),
        )
}
