use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::versions::v2::EditorType;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case", export)]
pub enum OpenEditorError {
    IdeCliNotFound {
        editor_type: EditorType,
        cli_command: String,
    },
    InvalidConfig {
        message: String,
    },
    Io {
        message: String,
    },
}
