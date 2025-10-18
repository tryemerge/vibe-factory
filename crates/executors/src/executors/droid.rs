use std::{collections::HashMap, path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use workspace_utils::{log_msg::LogMsg, msg_store::MsgStore, shell::get_shell_command};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{AppendPrompt, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
    logs::{
        ActionType, CommandExitStatus, CommandRunResult, NormalizedEntry, NormalizedEntryType,
        TodoItem, ToolStatus,
        stderr_processor::normalize_stderr_logs,
        utils::{EntryIndexProvider, patch::ConversationPatch},
    },
};

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
    fn build_command_builder(&self) -> CommandBuilder {
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

#[async_trait]
impl StandardCodingAgentExecutor for Droid {
    async fn spawn(&self, current_dir: &Path, prompt: &str) -> Result<SpawnedChild, ExecutorError> {
        let (shell_cmd, shell_arg) = get_shell_command();
        let droid_command = self.build_command_builder().build_initial();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&droid_command);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so droid sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let continue_cmd = self
            .build_command_builder()
            .build_follow_up(&["--session-id".to_string(), session_id.to_string()]);

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&continue_cmd);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so droid sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        DroidLogProcessor::process_logs(
            msg_store.clone(),
            current_dir,
            entry_index_provider.clone(),
        );

        // Process stderr logs using the standard stderr processor
        normalize_stderr_logs(msg_store, entry_index_provider);
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".factory").join("mcp.json"))
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
enum DroidJson {
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
        parameters: serde_json::Value,
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
        value: serde_json::Value,
        timestamp: u64,
        session_id: String,
    },
    Error {
        source: String,
        message: String,
        timestamp: u64,
    },
}

struct ToolCallInfo {
    tool_name: String,
    entry_index: usize,
    action_type: ActionType,
    content: String,
}

struct DroidLogProcessor {
    tool_map: HashMap<String, ToolCallInfo>,
}

impl DroidLogProcessor {
    fn process_logs(
        msg_store: Arc<MsgStore>,
        _current_dir: &Path,
        entry_index_provider: EntryIndexProvider,
    ) {
        tokio::spawn(async move {
            let mut stream = msg_store.history_plus_stream();
            let mut buffer = String::new();
            let mut session_id_extracted = false;
            let mut processor = Self {
                tool_map: HashMap::new(),
            };

            while let Some(Ok(msg)) = stream.next().await {
                let chunk = match msg {
                    LogMsg::Stdout(x) => x,
                    LogMsg::JsonPatch(_) | LogMsg::SessionId(_) | LogMsg::Stderr(_) => continue,
                    LogMsg::Finished => break,
                };

                buffer.push_str(&chunk);

                for line in buffer
                    .split_inclusive('\n')
                    .filter(|l| l.ends_with('\n'))
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
                {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<DroidJson>(trimmed) {
                        Ok(droid_json) => {
                            if !session_id_extracted
                                && let Some(session_id) = Self::extract_session_id(&droid_json)
                            {
                                msg_store.push_session_id(session_id);
                                session_id_extracted = true;
                            }

                            let patches =
                                processor.normalize_entries(&droid_json, &entry_index_provider);
                            for patch in patches {
                                msg_store.push_patch(patch);
                            }
                        }
                        Err(_) => {
                            if !trimmed.is_empty() {
                                let entry = NormalizedEntry {
                                    timestamp: None,
                                    entry_type: NormalizedEntryType::SystemMessage,
                                    content: trimmed.to_string(),
                                    metadata: None,
                                };

                                let patch_id = entry_index_provider.next();
                                let patch =
                                    ConversationPatch::add_normalized_entry(patch_id, entry);
                                msg_store.push_patch(patch);
                            }
                        }
                    }
                }

                buffer = buffer.rsplit('\n').next().unwrap_or("").to_owned();
            }

            if !buffer.trim().is_empty() {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: buffer.trim().to_string(),
                    metadata: None,
                };

                let patch_id = entry_index_provider.next();
                let patch = ConversationPatch::add_normalized_entry(patch_id, entry);
                msg_store.push_patch(patch);
            }
        });
    }

    fn extract_session_id(json: &DroidJson) -> Option<String> {
        match json {
            DroidJson::System { session_id, .. } => Some(session_id.clone()),
            DroidJson::Message { session_id, .. } => Some(session_id.clone()),
            DroidJson::ToolCall { session_id, .. } => Some(session_id.clone()),
            DroidJson::ToolResult { session_id, .. } => Some(session_id.clone()),
            DroidJson::Error { .. } => None,
        }
    }

    fn normalize_entries(
        &mut self,
        json: &DroidJson,
        entry_index_provider: &EntryIndexProvider,
    ) -> Vec<json_patch::Patch> {
        match json {
            DroidJson::System { .. } => {
                vec![]
            }
            DroidJson::Message { role, text, .. } => {
                let entry_type = match role.as_str() {
                    "user" => NormalizedEntryType::UserMessage,
                    "assistant" => NormalizedEntryType::AssistantMessage,
                    _ => NormalizedEntryType::SystemMessage,
                };
                vec![ConversationPatch::add_normalized_entry(
                    entry_index_provider.next(),
                    NormalizedEntry {
                        timestamp: None,
                        entry_type,
                        content: text.clone(),
                        metadata: None,
                    },
                )]
            }
            DroidJson::ToolCall {
                tool_name,
                parameters,
                id,
                ..
            } => {
                let action_type = Self::map_tool_to_action(tool_name, parameters);
                let content = Self::generate_concise_content(tool_name, &action_type);
                let entry_idx = entry_index_provider.next();

                self.tool_map.insert(
                    id.clone(),
                    ToolCallInfo {
                        tool_name: tool_name.clone(),
                        entry_index: entry_idx,
                        action_type: action_type.clone(),
                        content: content.clone(),
                    },
                );

                vec![ConversationPatch::add_normalized_entry(
                    entry_idx,
                    NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ToolUse {
                            tool_name: tool_name.clone(),
                            action_type,
                            status: ToolStatus::Created,
                        },
                        content,
                        metadata: Some(
                            serde_json::to_value(parameters).unwrap_or(serde_json::Value::Null),
                        ),
                    },
                )]
            }
            DroidJson::ToolResult {
                id,
                is_error,
                value,
                ..
            } => {
                if let Some(info) = self.tool_map.get(id) {
                    let status = if *is_error {
                        ToolStatus::Failed
                    } else {
                        ToolStatus::Success
                    };

                    // Parse the result value
                    let result_str = if let Some(s) = value.as_str() {
                        s.to_string()
                    } else {
                        serde_json::to_string_pretty(value).unwrap_or_default()
                    };

                    // For Execute commands, parse the result and extract exit code
                    let updated_action_type =
                        if matches!(info.action_type, ActionType::CommandRun { .. }) {
                            // Try to extract exit code from "[Process exited with code X]" pattern
                            let exit_code = result_str
                                .lines()
                                .find(|line| line.contains("[Process exited with code"))
                                .and_then(|line| {
                                    line.strip_prefix("[Process exited with code ")?
                                        .strip_suffix("]")?
                                        .parse::<i32>()
                                        .ok()
                                });

                            let result = Some(CommandRunResult {
                                exit_status: exit_code
                                    .map(|code| CommandExitStatus::ExitCode { code })
                                    .or(Some(CommandExitStatus::Success { success: !is_error })),
                                output: Some(result_str.clone()),
                            });

                            if let ActionType::CommandRun { command, .. } = &info.action_type {
                                ActionType::CommandRun {
                                    command: command.clone(),
                                    result,
                                }
                            } else {
                                info.action_type.clone()
                            }
                        } else {
                            info.action_type.clone()
                        };

                    // Create updated entry with status and result
                    let entry = NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ToolUse {
                            tool_name: info.tool_name.clone(),
                            action_type: updated_action_type,
                            status,
                        },
                        content: info.content.clone(),
                        metadata: None,
                    };

                    vec![ConversationPatch::replace(info.entry_index, entry)]
                } else {
                    vec![]
                }
            }
            DroidJson::Error { message, .. } => {
                vec![ConversationPatch::add_normalized_entry(
                    entry_index_provider.next(),
                    NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ErrorMessage,
                        content: message.clone(),
                        metadata: None,
                    },
                )]
            }
        }
    }

    fn generate_concise_content(tool_name: &str, action_type: &ActionType) -> String {
        match action_type {
            ActionType::FileRead { path } => format!("`{path}`"),
            ActionType::FileEdit { path, .. } => format!("`{path}`"),
            ActionType::CommandRun { command, .. } => format!("`{command}`"),
            ActionType::Search { query } => format!("`{query}`"),
            ActionType::WebFetch { url } => format!("`{url}`"),
            ActionType::TodoManagement { todos, .. } => {
                if todos.is_empty() {
                    "Todo list".to_string()
                } else {
                    format!("{} todo items", todos.len())
                }
            }
            ActionType::Other { description } => description.clone(),
            _ => tool_name.to_string(),
        }
    }

    fn map_tool_to_action(tool_name: &str, params: &serde_json::Value) -> ActionType {
        match tool_name {
            "Read" => ActionType::FileRead {
                path: params
                    .get("file_path")
                    .or_else(|| params.get("path"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            "LS" => ActionType::FileRead {
                path: params
                    .get("directory_path")
                    .or_else(|| params.get("path"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            "Glob" => ActionType::FileRead {
                path: params
                    .get("folder")
                    .or_else(|| params.get("path"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            "Grep" => ActionType::FileRead {
                path: params
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            "Execute" => ActionType::CommandRun {
                command: params
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                result: None,
            },
            "Edit" | "MultiEdit" | "Create" => ActionType::FileEdit {
                path: params
                    .get("file_path")
                    .or_else(|| params.get("path"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                changes: vec![],
            },
            "ApplyPatch" => ActionType::FileEdit {
                path: Self::extract_path_from_patch(params),
                changes: vec![],
            },
            "TodoWrite" => {
                let todos = params
                    .get("todos")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|item| {
                                Some(TodoItem {
                                    content: item.get("content")?.as_str()?.to_string(),
                                    status: item.get("status")?.as_str()?.to_string(),
                                    priority: item
                                        .get("priority")
                                        .and_then(|p| p.as_str())
                                        .map(|s| s.to_string()),
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                ActionType::TodoManagement {
                    todos,
                    operation: "update".to_string(),
                }
            }
            "WebSearch" => ActionType::WebFetch {
                url: params
                    .get("query")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            "FetchUrl" => ActionType::WebFetch {
                url: params
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            _ => ActionType::Other {
                description: tool_name.to_string(),
            },
        }
    }

    fn extract_path_from_patch(params: &serde_json::Value) -> String {
        if let Some(input) = params.get("input").and_then(|v| v.as_str()) {
            for line in input.lines() {
                if line.starts_with("*** Update File:") || line.starts_with("*** Create File:") {
                    return line
                        .split(':')
                        .nth(1)
                        .map(|s| s.trim().to_string())
                        .unwrap_or_default();
                }
            }
        }
        String::new()
    }
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
