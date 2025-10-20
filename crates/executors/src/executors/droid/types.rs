use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::{command::CmdOverrides, executors::AppendPrompt};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Autonomy {
    Normal,
    Low,
    Medium,
    High,
    SkipPermissionsUnsafe,
}

fn default_autonomy() -> Autonomy {
    Autonomy::Medium
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Droid {
    #[serde(default)]
    pub append_prompt: AppendPrompt,

    #[serde(default = "default_autonomy")]
    #[schemars(
        title = "Autonomy Level",
        description = "Permission level for file and system operations"
    )]
    pub autonomy: Autonomy,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Model",
        description = "Model to use (e.g., gpt-5-codex, claude-sonnet-4)"
    )]
    pub model: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(
        title = "Reasoning Effort",
        description = "Reasoning effort level: off, low, medium, high"
    )]
    pub reasoning_effort: Option<String>,

    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Droid {
    pub fn build_command_builder(&self) -> crate::command::CommandBuilder {
        use crate::command::{CommandBuilder, apply_overrides};

        let mut builder = CommandBuilder::new("droid exec").params(["--output-format=stream-json"]);

        let autonomy_args: Vec<&str> = match &self.autonomy {
            Autonomy::Normal => vec![],
            Autonomy::Low => vec!["--auto", "low"],
            Autonomy::Medium => vec!["--auto", "medium"],
            Autonomy::High => vec!["--auto", "high"],
            Autonomy::SkipPermissionsUnsafe => vec!["--skip-permissions-unsafe"],
        };
        builder = builder.extend_params(autonomy_args);

        if let Some(ref model) = self.model {
            builder = builder.extend_params(["--model", model]);
        }

        if let Some(ref effort) = self.reasoning_effort {
            builder = builder.extend_params(["--reasoning-effort", effort]);
        }

        apply_overrides(builder, &self.cmd)
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ToolError {
    #[serde(rename = "type")]
    pub kind: String,
    pub message: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(untagged)]
pub enum ToolResultPayload {
    Value { value: Value },
    Error { error: ToolError },
}

impl ToolResultPayload {
    pub fn value(&self) -> Option<&Value> {
        match self {
            ToolResultPayload::Value { value } => Some(value),
            _ => None,
        }
    }

    #[allow(dead_code)]
    pub fn error(&self) -> Option<&ToolError> {
        match self {
            ToolResultPayload::Error { error } => Some(error),
            _ => None,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DroidJson {
    System {
        #[serde(default)]
        subtype: Option<String>,
        session_id: String,
        #[serde(default)]
        cwd: Option<String>,
        #[serde(default)]
        tools: Option<Vec<String>>,
        #[serde(default)]
        model: Option<String>,
    },
    Message {
        role: String,
        id: String,
        text: String,
        timestamp: u64,
        session_id: String,
    },
    ToolCall {
        id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        parameters: Value,
        timestamp: u64,
        session_id: String,
    },
    ToolResult {
        id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        #[serde(rename = "toolId")]
        tool_id: String,
        #[serde(rename = "isError")]
        is_error: bool,
        #[serde(flatten)]
        payload: ToolResultPayload,
        timestamp: u64,
        session_id: String,
    },
    Error {
        source: String,
        message: String,
        timestamp: u64,
    },
}

impl DroidJson {
    pub fn session_id(&self) -> Option<&str> {
        match self {
            DroidJson::System { session_id, .. } => Some(session_id),
            DroidJson::Message { session_id, .. } => Some(session_id),
            DroidJson::ToolCall { session_id, .. } => Some(session_id),
            DroidJson::ToolResult { session_id, .. } => Some(session_id),
            DroidJson::Error { .. } => None,
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(tag = "toolName", content = "parameters")]
pub enum DroidToolData {
    Read {
        #[serde(alias = "path")]
        file_path: String,
    },
    LS {
        directory_path: String,
        #[serde(default)]
        #[serde(rename = "ignorePatterns")]
        ignore_patterns: Option<Vec<String>>,
    },
    Glob {
        folder: String,
        patterns: Vec<String>,
        #[serde(default)]
        #[serde(rename = "excludePatterns")]
        exclude_patterns: Option<Vec<String>>,
    },
    Grep {
        pattern: String,
        #[serde(default)]
        path: Option<String>,
        #[serde(default)]
        #[serde(rename = "caseSensitive")]
        case_sensitive: Option<bool>,
    },
    Execute {
        command: String,
        #[serde(default)]
        timeout: Option<u64>,
        #[serde(default)]
        #[serde(rename = "riskLevel")]
        risk_level: Option<Value>,
    },
    Edit {
        #[serde(alias = "path")]
        file_path: String,
        #[serde(alias = "old_str")]
        old_string: String,
        #[serde(alias = "new_str")]
        new_string: String,
    },
    MultiEdit {
        #[serde(alias = "path")]
        file_path: String,
        edits: Vec<DroidEditItem>,
    },
    Create {
        #[serde(alias = "path")]
        file_path: String,
        content: String,
    },
    ApplyPatch {
        input: String,
    },
    TodoWrite {
        todos: Vec<DroidTodoItem>,
    },
    WebSearch {
        query: String,
        #[serde(default)]
        max_results: Option<u32>,
    },
    FetchUrl {
        url: String,
        #[serde(default)]
        method: Option<String>,
    },
    ExitSpecMode {
        #[serde(default)]
        reason: Option<String>,
    },
    #[serde(rename = "slack_post_message")]
    SlackPostMessage {
        channel: String,
        text: String,
    },
    #[serde(untagged)]
    Unknown {
        #[serde(flatten)]
        data: std::collections::HashMap<String, Value>,
    },
}

impl DroidToolData {
    #[allow(dead_code)]
    pub fn get_name(&self) -> &str {
        match self {
            DroidToolData::Read { .. } => "Read",
            DroidToolData::LS { .. } => "LS",
            DroidToolData::Glob { .. } => "Glob",
            DroidToolData::Grep { .. } => "Grep",
            DroidToolData::Execute { .. } => "Execute",
            DroidToolData::Edit { .. } => "Edit",
            DroidToolData::MultiEdit { .. } => "MultiEdit",
            DroidToolData::Create { .. } => "Create",
            DroidToolData::ApplyPatch { .. } => "ApplyPatch",
            DroidToolData::TodoWrite { .. } => "TodoWrite",
            DroidToolData::WebSearch { .. } => "WebSearch",
            DroidToolData::FetchUrl { .. } => "FetchUrl",
            DroidToolData::ExitSpecMode { .. } => "ExitSpecMode",
            DroidToolData::SlackPostMessage { .. } => "slack_post_message",
            DroidToolData::Unknown { data } => data
                .get("toolName")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown"),
        }
    }
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct DroidTodoItem {
    #[serde(default)]
    pub id: Option<String>,
    pub content: String,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct DroidEditItem {
    pub old_string: Option<String>,
    pub new_string: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_droid_json_parsing() {
        let system_msg = r#"{"type":"system","subtype":"init","cwd":"/test","session_id":"test-123","tools":["Read"],"model":"gpt-5-codex"}"#;
        let user_msg = r#"{"type":"message","role":"user","id":"u1","text":"hello","timestamp":12345,"session_id":"test-123"}"#;
        let tool_call = r#"{"type":"tool_call","id":"t1","messageId":"m1","toolId":"Read","toolName":"Read","parameters":{"file_path":"test.txt"},"timestamp":12345,"session_id":"test-123"}"#;

        let parsed_system: Result<DroidJson, _> = serde_json::from_str(system_msg);
        let parsed_user: Result<DroidJson, _> = serde_json::from_str(user_msg);
        let parsed_tool: Result<DroidJson, _> = serde_json::from_str(tool_call);

        assert!(parsed_system.is_ok(), "System message should parse");
        assert!(parsed_user.is_ok(), "User message should parse");
        assert!(parsed_tool.is_ok(), "Tool call should parse");
    }
}
