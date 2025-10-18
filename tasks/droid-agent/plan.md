# Droid Executor Implementation Plan

## Context

This document provides a complete implementation plan for finishing the Droid executor integration in Vibe Kanban. The Droid executor has been partially implemented but is missing critical JSON log processing and configuration.

## Background

### What is Droid?
Droid is Factory's headless AI coding agent (similar to Claude Code, AMP, etc.) that executes tasks via `droid exec` CLI. It supports:
- Multiple autonomy levels (default read-only, low/medium/high for increasing permissions)
- Session continuation via `--session-id` flag
- Streaming JSON output via `--output-format=stream-json`
- Model selection and reasoning effort control

### How Executors Work in Vibe Kanban
Executors spawn external CLI processes that:
1. Receive prompts via stdin
2. Output streaming JSON on stdout (one JSON object per line)
3. Get parsed/normalized into UI-friendly patches via log processors
4. Extract `session_id` for follow-up conversations

Reference executors:
- **Claude Code**: Uses `ClaudeLogProcessor` to parse streaming JSON
- **AMP**: Reuses `ClaudeLogProcessor` (compatible protocol)
- Both extract `session_id` and normalize tool calls into `ActionType` enum

## Current Implementation Status

### ✅ Completed Work

**File: `crates/executors/src/executors/droid.rs`**
- Basic struct with autonomy levels enum
- `spawn()` method: launches `droid exec --output-format=stream-json`
- `spawn_follow_up()`: uses `--session-id <id>` for continuations
- Command builder with autonomy flags
- MCP config path: `~/.factory/mcp.json`

**File: `crates/executors/src/executors/mod.rs`**
- Registered in `CodingAgent` enum
- Included in module exports

**File: `crates/services/src/services/config/versions/v1.rs`**
- Config migration includes `Droid` variant

**File: `crates/db/src/models/executor_session.rs`**
- Database model supports `session_id` tracking (used by all executors)

### ❌ Missing Critical Components

## 1. JSON Log Processing (PRIMARY BLOCKER)

**Problem:** The `normalize_logs()` method in `droid.rs` is incomplete:
```rust
fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
    // TODO implement this
    normalize_stderr_logs(msg_store, entry_index_provider);
}
```

This method must:
1. Read streaming JSON from stdout (via `MsgStore`)
2. Parse each JSON line into structured data
3. Convert to normalized UI patches (`ConversationPatch` with `NormalizedEntry`)
4. Extract and push `session_id` to `MsgStore`

### Droid JSON Protocol Structure

Based on samples in `droid-json/` directory:

```json
// System initialization
{"type":"system","subtype":"init","cwd":"...","session_id":"...","tools":[...],"model":"gpt-5-codex"}

// User message
{"type":"message","role":"user","id":"...","text":"...","timestamp":...,"session_id":"..."}

// Assistant message
{"type":"message","role":"assistant","id":"...","text":"...","timestamp":...,"session_id":"..."}

// Tool call
{"type":"tool_call","id":"...","messageId":"...","toolId":"...","toolName":"Read","parameters":{...},"timestamp":...,"session_id":"..."}

// Tool result
{"type":"tool_result","id":"...","messageId":"...","toolId":"...","isError":false,"value":"...","timestamp":...,"session_id":"..."}

// Error (permission denied example)
{"type":"message","role":"assistant","text":"Exec ended early: insufficient permission..."}
{"type":"error","source":"cli","message":"Exec ended early...","timestamp":...}
```

### Important Notes on Autonomy Levels

Droid uses different terminology than other executors:
- **Normal** (Droid's "default" mode) - Read-only, safest mode
- **Low** - File operations in project directories  
- **Medium** - Development operations (this will be the default for users)
- **High** - Production operations including git push
- **Unsafe** - Skip all permissions (isolated environments only)

**Default for users:** Medium autonomy (good balance of safety and functionality)

**Droid-specific tools:**
- `Read`, `LS`, `Glob`, `Grep` - File operations (maps to `ActionType::FileRead`)
- `Execute` - Command execution (maps to `ActionType::CommandRun`)
- `Edit`, `MultiEdit`, `Create` - File modifications (maps to `ActionType::FileEdit`)
- `ApplyPatch` - Unified diff patches (unique to Droid, maps to `ActionType::FileEdit`)
- `TodoWrite` - Task management (maps to `ActionType::TodoManagement`)
- `WebSearch`, `FetchUrl` - Web operations (maps to `ActionType::WebFetch`)

### Implementation Options

**Option A: Reuse ClaudeLogProcessor (RECOMMENDED)**

The Droid protocol is similar enough to Claude's that we might be able to reuse the existing processor. The `ClaudeJson` enum in `crates/executors/src/executors/claude.rs` already handles:
- System messages with `session_id`
- User/assistant messages
- Tool calls with parameters
- Tool results

**Steps:**
1. Test if Droid JSON deserializes into existing `ClaudeJson` enum
2. If yes, implement `normalize_logs()` by calling `ClaudeLogProcessor::process_logs()` (like AMP does)
3. If no, extend `ClaudeJson` variants with serde aliases for Droid fields

**Option B: Create DroidLogProcessor**

If protocols are incompatible, create a new processor following the `ClaudeLogProcessor` pattern.

**Steps:**
1. Define `DroidJson` enum matching Droid's protocol
2. Create `DroidLogProcessor` struct with `process_logs()` method
3. Implement normalization logic mapping Droid tools to `ActionType`
4. Handle `session_id` extraction

## 2. Default Profiles Configuration

**File to modify:** `crates/executors/default_profiles.json`

Currently missing Droid section. Need to add:

```json
{
  "executors": {
    "DROID": {
      "DEFAULT": {
        "DROID": {
          "autonomy": "Medium"
        }
      },
      "NORMAL": {
        "DROID": {
          "autonomy": "Normal"
        }
      },
      "LOW": {
        "DROID": {
          "autonomy": "Low"
        }
      },
      "HIGH": {
        "DROID": {
          "autonomy": "High"
        }
      },
      "UNSAFE": {
        "DROID": {
          "autonomy": "Unsafe"
        }
      }
    }
  }
}
```

**Note:** "DEFAULT" profile uses "Medium" autonomy - this is what users get by default. It provides a good balance of safety and functionality for development work.

This defines profile variants users can select in the UI.

## 3. Session Continuation (NOT Fork)

**IMPORTANT:** Droid supports session continuation via `--session-id`, but this is NOT the same as "SessionFork" capability. 

- **Session continuation** = Resume existing session with new prompt (what Droid has)
- **SessionFork** = Create a branching conversation from a specific message (NOT supported by Droid)

**No changes needed to `capabilities()` method** - Droid should return `vec![]` (empty capabilities).

The existing `spawn_follow_up()` implementation in `droid.rs` already handles continuation correctly via `--session-id` flag. The UI will use this for follow-up prompts without needing the `SessionFork` capability.

## 4. Additional Configuration Fields

**File to modify:** `crates/executors/src/executors/droid.rs`

The Droid struct should support additional CLI options from the official docs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Droid {
    pub append_prompt: AppendPrompt,
    
    #[serde(default)]
    #[schemars(title = "Autonomy Level", description = "Permission level for file and system operations")]
    pub autonomy: Autonomy,
    
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(title = "Model", description = "Model to use (e.g., gpt-5-codex, claude-sonnet-4)")]
    pub model: Option<String>,
    
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(title = "Reasoning Effort", description = "Reasoning effort level: off, low, medium, high")]
    pub reasoning_effort: Option<String>,
    
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Droid {
    fn build_command_builder(&self) -> CommandBuilder {
        let mut builder = CommandBuilder::new("droid exec")
            .params(["--output-format=stream-json"]);
        
        // Add autonomy flags
        let autonomy_args: Vec<&str> = match self.autonomy {
            Autonomy::Normal => vec![],  // No flag = Droid's read-only default
            Autonomy::Low => vec!["--auto", "low"],
            Autonomy::Medium => vec!["--auto", "medium"],
            Autonomy::High => vec!["--auto", "high"],
            Autonomy::Unsafe => vec!["--skip-permissions-unsafe"],
        };
        builder = builder.extend_params(autonomy_args);
        
        // Add model if specified
        if let Some(ref model) = self.model {
            builder = builder.extend_params(["--model", model]);
        }
        
        // Add reasoning effort if specified
        if let Some(ref effort) = self.reasoning_effort {
            builder = builder.extend_params(["--reasoning-effort", effort]);
        }

        apply_overrides(builder, &self.cmd)
    }
}
```

Also update the `Autonomy` enum to have better schema annotations:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
#[serde(rename_all = "PascalCase")]
pub enum Autonomy {
    #[schemars(title = "Normal", description = "Read-only mode (safest, Droid's default)")]
    Normal,
    
    #[schemars(title = "Low", description = "File operations in project directories")]
    Low,
    
    #[schemars(title = "Medium", description = "Development operations (recommended default)")]
    Medium,
    
    #[schemars(title = "High", description = "Production operations including git push")]
    High,
    
    #[schemars(title = "Unsafe", description = "Bypass all checks - use only in isolated environments")]
    Unsafe,
}

impl Default for Autonomy {
    fn default() -> Self {
        Self::Medium  // Users get Medium by default (not Normal)
    }
}
```

## Summary of Changes Needed

1. **JSON log processing** - Implement `normalize_logs()` (test Claude compatibility first)
2. **Profile configuration** - Add to `default_profiles.json` with Medium as default
3. **Configuration fields** - Add `model` and `reasoning_effort` options
4. **Autonomy enum** - Rename `Default` → `Normal`, `SkipPermissionsUnsafe` → `Unsafe`

**NO changes needed for:**
- Session capabilities (Droid doesn't support forking)
- Executor registration (already done)
- Database models (already compatible)

## Implementation Steps

### Step 1: Test JSON Compatibility (CRITICAL FIRST STEP)

Create a test to verify if Droid JSON can deserialize into `ClaudeJson`:

**File:** `crates/executors/src/executors/droid.rs` (add test module)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::executors::claude::ClaudeJson;

    #[test]
    fn test_droid_json_compatibility() {
        // Test samples from droid-json/ directory
        let system_msg = r#"{"type":"system","subtype":"init","cwd":"/test","session_id":"test-123","tools":["Read"],"model":"gpt-5-codex"}"#;
        let user_msg = r#"{"type":"message","role":"user","id":"u1","text":"hello","timestamp":12345,"session_id":"test-123"}"#;
        let tool_call = r#"{"type":"tool_call","id":"t1","messageId":"m1","toolId":"Read","toolName":"Read","parameters":{"file_path":"test.txt"},"timestamp":12345,"session_id":"test-123"}"#;
        
        // Try parsing with ClaudeJson
        let parsed_system: Result<ClaudeJson, _> = serde_json::from_str(system_msg);
        let parsed_user: Result<ClaudeJson, _> = serde_json::from_str(user_msg);
        let parsed_tool: Result<ClaudeJson, _> = serde_json::from_str(tool_call);
        
        // If these succeed, we can reuse ClaudeLogProcessor
        assert!(parsed_system.is_ok(), "System message should parse");
        assert!(parsed_user.is_ok(), "User message should parse");
        assert!(parsed_tool.is_ok(), "Tool call should parse");
    }
}
```

**Run test:**
```bash
cargo test -p executors test_droid_json_compatibility
```

### Step 2A: If Compatible - Implement Using ClaudeLogProcessor

**File:** `crates/executors/src/executors/droid.rs`

Replace the `normalize_logs` implementation:

```rust
fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
    let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

    // Process stdout logs using Claude's log processor
    // Droid's JSON protocol is compatible
    ClaudeLogProcessor::process_logs(
        msg_store.clone(),
        current_dir,
        entry_index_provider.clone(),
        HistoryStrategy::Default, // Or create HistoryStrategy::Droid if needed
    );

    // Process stderr logs using the standard stderr processor
    normalize_stderr_logs(msg_store, entry_index_provider);
}
```

### Step 2B: If Incompatible - Create DroidLogProcessor

**File:** Create `crates/executors/src/executors/droid_protocol.rs`

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DroidJson {
    System {
        subtype: Option<String>,
        session_id: String,
        cwd: Option<String>,
        tools: Option<Vec<String>>,
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

pub struct DroidLogProcessor {
    tool_map: HashMap<String, String>, // tool_call_id -> tool_name
}

impl DroidLogProcessor {
    pub fn process_logs(
        msg_store: Arc<MsgStore>,
        current_dir: &Path,
        entry_index_provider: EntryIndexProvider,
    ) {
        // Implementation similar to ClaudeLogProcessor::process_logs
        // See crates/executors/src/executors/claude.rs:387-470 for reference
        
        let current_dir_clone = current_dir.to_owned();
        tokio::spawn(async move {
            let mut stream = msg_store.history_plus_stream();
            let mut buffer = String::new();
            let mut session_id_extracted = false;
            let mut processor = Self { tool_map: HashMap::new() };

            while let Some(Ok(msg)) = stream.next().await {
                let chunk = match msg {
                    LogMsg::Stdout(x) => x,
                    LogMsg::JsonPatch(_) | LogMsg::SessionId(_) | LogMsg::Stderr(_) => continue,
                    LogMsg::Finished => break,
                };

                buffer.push_str(&chunk);

                // Process complete JSON lines
                for line in buffer.split_inclusive('\n')
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
                            // Extract session ID if present
                            if !session_id_extracted {
                                if let Some(session_id) = Self::extract_session_id(&droid_json) {
                                    msg_store.push_session_id(session_id);
                                    session_id_extracted = true;
                                }
                            }

                            // Convert to normalized entries
                            let patches = processor.normalize_entries(
                                &droid_json,
                                &entry_index_provider,
                            );
                            for patch in patches {
                                msg_store.push_patch(patch);
                            }
                        }
                        Err(_) => {
                            // Handle non-JSON as system message
                            // ... (same pattern as ClaudeLogProcessor)
                        }
                    }
                }

                buffer = buffer.rsplit('\n').next().unwrap_or("").to_owned();
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
    ) -> Vec<ConversationPatch> {
        match json {
            DroidJson::System { .. } => {
                vec![ConversationPatch::add_normalized_entry(
                    entry_index_provider.next(),
                    NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::SystemMessage,
                        content: "System initialized".to_string(),
                        metadata: None,
                    }
                )]
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
                    }
                )]
            }
            DroidJson::ToolCall { tool_name, parameters, id, .. } => {
                self.tool_map.insert(id.clone(), tool_name.clone());
                let action_type = Self::map_tool_to_action(tool_name, parameters);
                vec![ConversationPatch::add_normalized_entry(
                    entry_index_provider.next(),
                    NormalizedEntry {
                        timestamp: None,
                        entry_type: NormalizedEntryType::ToolUse {
                            tool_name: tool_name.clone(),
                            action_type,
                            status: ToolStatus::Created,
                        },
                        content: serde_json::to_string_pretty(parameters).unwrap_or_default(),
                        metadata: None,
                    }
                )]
            }
            // ... handle ToolResult, Error
            _ => vec![],
        }
    }

    fn map_tool_to_action(tool_name: &str, params: &serde_json::Value) -> ActionType {
        match tool_name {
            "Read" | "LS" | "Glob" | "Grep" => {
                ActionType::FileRead {
                    path: params.get("file_path")
                        .or(params.get("path"))
                        .or(params.get("directory_path"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                }
            }
            "Execute" => {
                ActionType::CommandRun {
                    command: params.get("command")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    result: None,
                }
            }
            "Edit" | "MultiEdit" | "Create" | "ApplyPatch" => {
                ActionType::FileEdit {
                    path: params.get("file_path")
                        .or(params.get("path"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    changes: vec![], // Parse from params
                }
            }
            "TodoWrite" => {
                ActionType::TodoManagement {
                    todos: vec![],
                    operation: "update".to_string(),
                }
            }
            "WebSearch" | "FetchUrl" => {
                ActionType::WebFetch {
                    url: params.get("url")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                }
            }
            _ => ActionType::Other {
                description: tool_name.to_string(),
            }
        }
    }
}
```

Then update `droid.rs` to use it:

```rust
mod droid_protocol;
use droid_protocol::DroidLogProcessor;

fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
    let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

    DroidLogProcessor::process_logs(
        msg_store.clone(),
        current_dir,
        entry_index_provider.clone(),
    );

    normalize_stderr_logs(msg_store, entry_index_provider);
}
```

### Step 3: Update Default Profiles

**File:** `crates/executors/default_profiles.json`

Add the Droid section after the COPILOT section:

```json
    "DROID": {
      "DEFAULT": {
        "DROID": {
          "autonomy": "Medium"
        }
      },
      "NORMAL": {
        "DROID": {
          "autonomy": "Normal"
        }
      },
      "LOW": {
        "DROID": {
          "autonomy": "Low"
        }
      },
      "HIGH": {
        "DROID": {
          "autonomy": "High"
        }
      },
      "UNSAFE": {
        "DROID": {
          "autonomy": "Unsafe"
        }
      }
    }
```

### Step 4: Verify Capabilities (No Changes Needed)

**File:** `crates/executors/src/executors/mod.rs`

**Line:** ~135

The current code is correct:
```rust
Self::Opencode(_) | Self::Cursor(_) | Self::Copilot(_) | Self::Droid(_) => vec![],
```

**Why no SessionFork?** Droid supports session *continuation* (resuming with `--session-id`) but not session *forking* (branching from a specific message). The `spawn_follow_up()` implementation already handles continuation correctly.

### Step 5: Add Configuration Fields

**File:** `crates/executors/src/executors/droid.rs`

Update the struct and implementation as shown in section 4 above.

### Step 6: Generate TypeScript Types

After all Rust changes:

```bash
npm run generate-types
```

This regenerates `shared/types.ts` and JSON schemas for the frontend.

### Step 7: Build and Verify

1. **Build the project:**
   ```bash
   cargo build
   ```

2. **Run tests:**
   ```bash
   cargo test -p executors
   ```

3. **Verify compilation succeeds** with no errors or warnings

**Note:** End-to-end testing (UI interaction, session continuation, etc.) will be performed separately by a human tester.

## File Reference

### Files to Read (for context)

1. **`crates/executors/src/executors/claude.rs`**
   - Lines 356-700: `ClaudeLogProcessor` implementation
   - Lines 1439-1650: `ClaudeJson` enum and tool data structures
   - Reference for how JSON log processing works

2. **`crates/executors/src/executors/amp.rs`**
   - Lines 144-160: Example of reusing `ClaudeLogProcessor`
   - Shows how AMP (similar protocol) delegates to Claude's processor

3. **`crates/executors/src/logs/mod.rs`**
   - Lines 1-200: Normalized entry types and action types
   - Defines the UI data structures all executors normalize to

4. **`crates/executors/src/logs/utils/patch.rs`**
   - `ConversationPatch` structure for UI updates

5. **`droid-json/` directory**
   - Sample JSON outputs to understand the protocol
   - `edits-and-execution.jsonl`: Complete workflow example
   - `insufficient-perms.jsonl`: Error handling example

### Files to Modify

1. **`crates/executors/src/executors/droid.rs`** (PRIMARY)
   - Implement `normalize_logs()` method
   - Add `model` and `reasoning_effort` fields
   - Update `build_command_builder()` to use new fields
   - Update `Autonomy` enum with better schema annotations
   - Add tests

2. **`crates/executors/default_profiles.json`**
   - Add Droid profile variants (DEFAULT uses Medium autonomy)

4. **OPTIONAL: `crates/executors/src/executors/claude.rs`**
   - Only if extending `ClaudeJson` to support Droid-specific fields
   - Add serde aliases if field names differ slightly

5. **OPTIONAL: Create `crates/executors/src/executors/droid_protocol.rs`**
   - Only if Droid protocol is incompatible with Claude
   - Define `DroidJson` enum and `DroidLogProcessor`

### Files That Are Already Correct (no changes needed)

- `crates/db/src/models/executor_session.rs` - Session tracking works
- `crates/services/src/services/config/versions/v1.rs` - Config migration includes Droid
- `crates/executors/src/command.rs` - Command builder works correctly

## Testing Checklist

After implementation, the following should be verified:

**Automated Tests (you should run these):**
- [ ] Unit tests pass: `cargo test -p executors`
- [ ] Project builds without errors: `cargo build`
- [ ] TypeScript types generated correctly: `npm run generate-types`
- [ ] No compilation warnings in Rust code

**Manual Verification (human tester will perform):**
- [ ] JSON logs parse correctly (no errors in backend logs)
- [ ] `session_id` extracted and saved to database
- [ ] Initial task execution works with all autonomy levels
- [ ] Follow-up conversations work (session continuation)
- [ ] Tool calls render in UI with correct action types
- [ ] File edits show diffs correctly
- [ ] Command execution shows output
- [ ] Error messages (permission denied) display properly
- [ ] Model selection works if implemented
- [ ] Reasoning effort flag works if implemented
- [ ] MCP config integration works
- [ ] Frontend loads Droid config schema

## Common Issues & Debugging

### Issue: "TODO implement this" error in logs
**Cause:** `normalize_logs()` not implemented  
**Solution:** Follow Step 2A or 2B above

### Issue: Session ID not saving
**Cause:** `session_id` not being extracted from JSON  
**Solution:** Verify `extract_session_id()` handles all Droid JSON variants

### Issue: Tools not rendering in UI
**Cause:** Tool names not mapped to `ActionType`  
**Solution:** Check `map_tool_to_action()` covers all Droid tools

### Issue: Follow-ups not working
**Cause:** Session ID not being persisted or passed correctly  
**Solution:** Check that `session_id` extraction works in Step 2, verify database has session_id saved

### Issue: Droid profiles not appearing in UI
**Cause:** `default_profiles.json` not updated or types not regenerated  
**Solution:** Complete Step 3 and run `npm run generate-types`

### Issue: JSON parsing errors
**Debug steps:**
1. Check backend logs for specific parse errors
2. Look at raw stdout in database (ExecutionProcess table)
3. Compare against samples in `droid-json/`
4. Add debug logging to see what line is failing

### Issue: ApplyPatch tool not rendering correctly
**Cause:** Droid's `ApplyPatch` tool has unique format  
**Solution:** Parse `parameters.input` field which contains unified diff format

## Success Criteria

The implementation is complete when:

**Code Complete (your responsibility):**
1. ✅ `normalize_logs()` method is fully implemented
2. ✅ Droid profiles added to `default_profiles.json`
3. ✅ Configuration fields (`model`, `reasoning_effort`) added to struct
4. ✅ Autonomy enum renamed (Normal/Low/Medium/High/Unsafe)
5. ✅ Command builder updated to use new fields
6. ✅ Project builds without errors: `cargo build`
7. ✅ Tests pass: `cargo test -p executors`
8. ✅ TypeScript types generated: `npm run generate-types`

**Integration Verified (human tester):**
9. ✅ Task execution works with Droid executor in UI
10. ✅ Logs render correctly in real-time
11. ✅ Session continuation works for follow-ups
12. ✅ All autonomy levels function as expected

## Additional Resources

- **Droid documentation:** `tasks/1846-droid-research/droid-docs.md`
- **Executor research notes:** `tasks/1846-droid-research/executor-research.md`
- **JSON samples:** `droid-json/` directory
- **Claude Code docs:** Reference implementation in `crates/executors/src/executors/claude.rs`
- **Vibe Kanban architecture:** `CLAUDE.md` in repo root

## Estimated Effort

- **If reusing ClaudeLogProcessor:** 2-3 hours
  - 30 min: JSON compatibility testing
  - 1 hour: Implementation (mostly config)
  - 1 hour: Testing and debugging

- **If custom processor needed:** 4-6 hours
  - 30 min: JSON compatibility testing
  - 2 hours: Protocol parsing implementation
  - 1 hour: Tool mapping
  - 1.5 hours: Testing and debugging

## Contact & Questions

If you encounter issues not covered here:
1. Check existing executor implementations (Claude, AMP) for reference
2. Review test files in `crates/executors/src/executors/*/tests/`
3. Look for similar patterns in `crates/services/src/services/container.rs` for execution flow
