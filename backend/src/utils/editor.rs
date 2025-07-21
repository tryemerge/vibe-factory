use axum::{http::StatusCode, response::Json as ResponseJson};
use serde::Deserialize;
use crate::{app_state::AppState, models::ApiResponse};

#[derive(Debug, Deserialize)]
pub struct OpenEditorRequest {
    pub editor_type: Option<String>,
}

/// Opens an editor at the specified path using the configuration from app_state
/// 
/// # Arguments
/// * `app_state` - The application state containing editor configuration
/// * `path` - The directory or file path to open in the editor
/// * `editor_override` - Optional editor type to override the default configuration
/// * `context_name` - A descriptive name for logging (e.g., "project", "task attempt")
/// * `context_id` - An ID for logging purposes
pub async fn open_editor_at_path(
    app_state: &AppState,
    path: &str,
    editor_override: Option<&str>,
    context_name: &str,
    context_id: impl std::fmt::Display,
) -> Result<ResponseJson<ApiResponse<()>>, StatusCode> {
    // Get editor command from config or override
    let editor_command = {
        let config_guard = app_state.get_config().read().await;
        if let Some(editor_type) = editor_override {
            // Create a temporary editor config with the override
            use crate::models::config::{EditorConfig, EditorType};
            let override_editor_type = match editor_type {
                "vscode" => EditorType::VSCode,
                "cursor" => EditorType::Cursor,
                "windsurf" => EditorType::Windsurf,
                "intellij" => EditorType::IntelliJ,
                "zed" => EditorType::Zed,
                "custom" => EditorType::Custom,
                _ => config_guard.editor.editor_type.clone(),
            };
            let temp_config = EditorConfig {
                editor_type: override_editor_type,
                custom_command: config_guard.editor.custom_command.clone(),
            };
            temp_config.get_command()
        } else {
            config_guard.editor.get_command()
        }
    };

    // Open editor at the specified path
    let mut cmd = std::process::Command::new(&editor_command[0]);
    for arg in &editor_command[1..] {
        cmd.arg(arg);
    }
    cmd.arg(path);

    match cmd.spawn() {
        Ok(_) => {
            tracing::info!(
                "Opened editor ({}) for {} {} at path: {}",
                editor_command.join(" "),
                context_name,
                context_id,
                path
            );
            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(e) => {
            tracing::error!(
                "Failed to open editor ({}) for {} {}: {}",
                editor_command.join(" "),
                context_name,
                context_id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}