use std::{collections::HashMap, path::Path};

use super::{
    action_mapper,
    types::{DroidJson, ToolResultPayload},
};
use crate::logs::{
    ActionType, CommandExitStatus, CommandRunResult, NormalizedEntry, NormalizedEntryType,
    ToolStatus,
};

#[derive(Default, Debug, Clone, serde::Serialize)]
pub struct ProcessorState {
    pub tool_map: HashMap<String, PendingToolCall>,
    pub model_reported: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PendingToolCall {
    pub tool_name: String,
    pub action_type: ActionType,
    pub content: String,
}

/// Lightweight wrapper around NormalizedEntry with correlation info
#[derive(Debug, Clone, serde::Serialize)]
pub enum LogEvent {
    /// Add a new entry
    AddEntry(NormalizedEntry),
    /// Add a new tool call (needs tool_call_id tracking for later update)
    AddToolCall {
        tool_call_id: String,
        entry: NormalizedEntry,
    },
    /// Update an existing tool call (needs tool_call_id to find it)
    UpdateToolCall {
        tool_call_id: String,
        entry: NormalizedEntry,
    },
}

impl ProcessorState {
    pub fn process_event(&mut self, event: &DroidJson, worktree_path: &Path) -> Option<LogEvent> {
        match event {
            DroidJson::System { model, .. } => {
                if !self.model_reported
                    && let Some(model) = model
                {
                    self.model_reported = true;
                    Some(LogEvent::AddEntry(NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: format!("model: {model}"),
                        metadata: None,
                    }))
                } else {
                    None
                }
            }
            DroidJson::Message { role, text, .. } => {
                let entry_type = match role.as_str() {
                    "user" => NormalizedEntryType::UserMessage,
                    "assistant" => NormalizedEntryType::AssistantMessage,
                    _ => NormalizedEntryType::SystemMessage,
                };

                Some(LogEvent::AddEntry(NormalizedEntry {
                    timestamp: None,
                    entry_type,
                    content: text.clone(),
                    metadata: None,
                }))
            }
            DroidJson::ToolCall {
                id,
                tool_name,
                parameters,
                ..
            } => {
                let action_type =
                    action_mapper::map_tool_to_action(tool_name, parameters, worktree_path);
                let content = action_mapper::generate_concise_content(tool_name, &action_type);

                self.tool_map.insert(
                    id.clone(),
                    PendingToolCall {
                        tool_name: tool_name.clone(),
                        action_type: action_type.clone(),
                        content: content.clone(),
                    },
                );

                Some(LogEvent::AddToolCall {
                    tool_call_id: id.clone(),
                    entry: NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ToolUse {
                            tool_name: tool_name.clone(),
                            action_type,
                            status: ToolStatus::Created,
                        },
                        content,
                        metadata: None,
                    },
                })
            }
            DroidJson::ToolResult {
                id,
                is_error,
                payload,
                ..
            } => {
                if let Some(call) = self.tool_map.remove(id) {
                    let status = if *is_error {
                        ToolStatus::Failed
                    } else {
                        ToolStatus::Success
                    };

                    let updated_action_type =
                        compute_updated_action_type(&call, payload, *is_error, worktree_path);

                    Some(LogEvent::UpdateToolCall {
                        tool_call_id: id.clone(),
                        entry: NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::ToolUse {
                                tool_name: call.tool_name,
                                action_type: updated_action_type,
                                status,
                            },
                            content: call.content,
                            metadata: None,
                        },
                    })
                } else {
                    // Tool result either received before called, or duplicated
                    tracing::error!("Failed to match tool result with tool call for id: {}", id);
                    None
                }
            }
            DroidJson::Error { message, .. } => Some(LogEvent::AddEntry(NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage,
                content: message.clone(),
                metadata: None,
            })),
        }
    }
}

// We have more data about a tool call after receiving a tool call result
// Here we normalise that data too
fn compute_updated_action_type(
    call: &PendingToolCall,
    payload: &ToolResultPayload,
    is_error: bool,
    worktree_path: &Path,
) -> ActionType {
    if let ToolResultPayload::Value { value } = payload {
        let result_str = if let Some(s) = value.as_str() {
            s.to_string()
        } else {
            serde_json::to_string_pretty(value).unwrap_or_default()
        };

        let res = match call.action_type {
            ActionType::FileEdit { .. } => {
                if call.tool_name == "ApplyPatch" {
                    let worktree_path_str = worktree_path.to_string_lossy();
                    Some(
                        action_mapper::parse_apply_patch_result(value, &worktree_path_str)
                            .unwrap_or_else(|| call.action_type.clone()),
                    )
                } else {
                    None
                }
            }
            ActionType::CommandRun { ref command, .. } => {
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
                    output: Some(result_str),
                });

                Some(ActionType::CommandRun {
                    command: command.clone(),
                    result,
                })
            }
            _ => None,
        };

        res.unwrap_or(call.action_type.clone())
    } else {
        call.action_type.clone()
    }
}
