use std::{collections::HashMap, path::Path};

use super::{
    action_mapper,
    types::{DroidJson, ToolResultPayload},
};
use crate::logs::{
    ActionType, CommandExitStatus, CommandRunResult, NormalizedEntry, NormalizedEntryType,
    ToolStatus,
};

#[derive(Default, Debug, Clone)]
pub struct ProcessorState {
    pub tool_map: HashMap<String, PendingToolCall>,
    pub model_reported: bool,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PendingToolCall {
    pub tool_name: String,
    pub tool_call_id: String,
    pub message_id: String,
    pub action_type: ActionType,
    pub content: String,
    pub timestamp: u64,
}

/// Lightweight wrapper around NormalizedEntry with correlation info
#[derive(Debug, Clone)]
pub enum DomainEvent {
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

pub fn process_event(
    state: ProcessorState,
    event: &DroidJson,
    worktree_path: &Path,
) -> (ProcessorState, Vec<DomainEvent>) {
    let mut state = state;
    let mut events = Vec::new();

    match event {
        DroidJson::System { model, .. } => {
            if !state.model_reported
                && let Some(model) = model
            {
                state.model_reported = true;
                events.push(DomainEvent::AddEntry(NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content: format!("model: {model}"),
                    metadata: None,
                }));
            }
        }

        DroidJson::Message { role, text, .. } => {
            let entry_type = match role.as_str() {
                "user" => NormalizedEntryType::UserMessage,
                "assistant" => NormalizedEntryType::AssistantMessage,
                _ => NormalizedEntryType::SystemMessage,
            };

            events.push(DomainEvent::AddEntry(NormalizedEntry {
                timestamp: None,
                entry_type,
                content: text.clone(),
                metadata: None,
            }));
        }

        DroidJson::ToolCall {
            id,
            message_id,
            tool_name,
            parameters,
            timestamp,
            ..
        } => {
            let action_type =
                action_mapper::map_tool_to_action(tool_name, parameters, worktree_path);
            let content = action_mapper::generate_concise_content(tool_name, &action_type);

            state.tool_map.insert(
                id.clone(),
                PendingToolCall {
                    tool_name: tool_name.clone(),
                    tool_call_id: id.clone(),
                    message_id: message_id.clone(),
                    action_type: action_type.clone(),
                    content: content.clone(),
                    timestamp: *timestamp,
                },
            );

            let mut metadata = parameters.clone();
            if let Some(obj) = metadata.as_object_mut() {
                obj.insert("toolCallId".to_string(), serde_json::json!(id));
            }

            events.push(DomainEvent::AddToolCall {
                tool_call_id: id.clone(),
                entry: NormalizedEntry {
                    timestamp: Some(timestamp.to_string()),
                    entry_type: NormalizedEntryType::ToolUse {
                        tool_name: tool_name.clone(),
                        action_type,
                        status: ToolStatus::Created,
                    },
                    content,
                    metadata: Some(metadata),
                },
            });
        }

        DroidJson::ToolResult {
            id,
            is_error,
            payload,
            ..
        } => {
            if let Some(call) = state.tool_map.remove(id) {
                let status = if *is_error {
                    ToolStatus::Failed
                } else {
                    ToolStatus::Success
                };

                let updated_action_type = compute_updated_action_type(&call, payload, *is_error);

                events.push(DomainEvent::UpdateToolCall {
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
                });
            }
        }

        DroidJson::Error { message, .. } => {
            events.push(DomainEvent::AddEntry(NormalizedEntry {
                timestamp: None,
                entry_type: NormalizedEntryType::ErrorMessage,
                content: message.clone(),
                metadata: None,
            }));
        }
    }

    (state, events)
}

fn compute_updated_action_type(
    call: &PendingToolCall,
    payload: &ToolResultPayload,
    is_error: bool,
) -> ActionType {
    if let ToolResultPayload::Value { value } = payload {
        let result_str = if let Some(s) = value.as_str() {
            s.to_string()
        } else {
            serde_json::to_string_pretty(value).unwrap_or_default()
        };

        if matches!(call.action_type, ActionType::CommandRun { .. }) {
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

            if let ActionType::CommandRun { command, .. } = &call.action_type {
                ActionType::CommandRun {
                    command: command.clone(),
                    result,
                }
            } else {
                call.action_type.clone()
            }
        } else if matches!(call.action_type, ActionType::FileEdit { .. })
            && call.tool_name == "ApplyPatch"
        {
            action_mapper::parse_apply_patch_result(value)
                .unwrap_or_else(|| call.action_type.clone())
        } else {
            call.action_type.clone()
        }
    } else {
        call.action_type.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executors::droid::{
        patch_emitter::{IndexProviderLike, PatchEmitter},
        types::DroidJson,
    };

    struct FakeIndexProvider {
        counter: std::cell::Cell<usize>,
    }

    impl FakeIndexProvider {
        fn new() -> Self {
            Self {
                counter: std::cell::Cell::new(0),
            }
        }
    }

    impl IndexProviderLike for FakeIndexProvider {
        fn next(&self) -> usize {
            let val = self.counter.get();
            self.counter.set(val + 1);
            val
        }
    }

    #[test]
    fn test_process_tool_call_and_error_result() {
        let state = ProcessorState::default();
        let mut patch_emitter = PatchEmitter::new();
        let fake_index = FakeIndexProvider::new();
        let worktree_path = Path::new("/tmp/vibe-kanban");

        let tool_call = DroidJson::ToolCall {
            id: "call_W4t4W4TDhrZFiM9DxVox21PW".to_string(),
            message_id: "c58eb7a4-c0c9-41a4-849c-b2c537f8347b".to_string(),
            tool_id: "Execute".to_string(),
            tool_name: "Execute".to_string(),
            parameters: serde_json::json!({
                "command": "printf 'a' > \"/tmp/vibe-kanban/a.txt\"",
                "riskLevel": {"value": "medium", "reason": "Command creates/overwrites a file in the repository."}
            }),
            timestamp: 1760806562636,
            session_id: "608a704f-8a2d-45ef-8ac5-647ec9d48806".to_string(),
        };

        let (state, events) = process_event(state, &tool_call, worktree_path);
        let patches = patch_emitter.emit_patches(events, &fake_index);

        assert_eq!(patches.len(), 1);
        assert_eq!(fake_index.counter.get(), 1);

        let tool_result_json = r#"{"type":"tool_result","id":"call_W4t4W4TDhrZFiM9DxVox21PW","messageId":"472dc864-e8ae-47ad-ac59-5006a54cb113","toolId":"","isError":true,"error":{"type":"tool_error","message":"Error: tool execution cancelled"},"timestamp":1760806562640,"session_id":"608a704f-8a2d-45ef-8ac5-647ec9d48806"}"#;

        let tool_result: DroidJson =
            serde_json::from_str(tool_result_json).expect("should parse error result");

        let (_new_state, events) = process_event(state, &tool_result, worktree_path);
        let patches = patch_emitter.emit_patches(events, &fake_index);

        assert_eq!(patches.len(), 1, "should produce a patch for error result");
    }
}
