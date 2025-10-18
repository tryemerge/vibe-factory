# Custom Executor Implementation Research

## Overview

This document details how custom executors work in the vibe-kanban codebase, with a focus on JSON-based executors like AMP and Claude Code that could serve as models for implementing a "droid exec" style executor.

## 1. Executor Implementations

### Claude Code Executor
**Location:** `crates/executors/src/executors/claude.rs`

- **Struct:** `ClaudeCode`
- **Trait:** Implements `StandardCodingAgentExecutor`
- **Key behaviors:**
  - Spawns `claude-code` CLI via shell with `--output-format=stream-json`
  - Writes task prompt to stdin and closes stdin to signal EOF
  - For follow-ups: forks session and resumes with `--fork-session --resume <session_id>`
  - Normalizes stdout JSON to UI patches via `ClaudeLogProcessor`
  - Extracts `session_id` from stdout JSON and emits to `MsgStore`

### AMP Executor
**Location:** `crates/executors/src/executors/amp.rs`

- **Struct:** `Amp`
- **Trait:** Implements `StandardCodingAgentExecutor`
- **Key behaviors:**
  - Spawns AMP via `npx` with `--execute --stream-json`
  - Writes prompt to stdin and closes
  - **Follow-ups:** AMP requires two-step CLI sequence:
    - `threads fork <session_id>` → returns new thread id
    - `threads continue <new_thread_id>` with new prompt via stdin
  - Reuses `ClaudeLogProcessor` for stream JSON normalization (AMP's stream is Claude-compatible)
  - Extracts `session_id` via `ClaudeLogProcessor`

### Supporting Code
- **Trait and dispatch:** `crates/executors/src/executors/mod.rs`
- **Action dispatch:** `crates/executors/src/actions/*`
- **Container orchestration:** 
  - Server: `crates/services/src/services/container.rs`
  - Local: `crates/local-deployment/src/container.rs`
- **Profiles:** `crates/executors/default_profiles.json` and `crates/executors/src/profile.rs`

## 2. JSON Communication Protocol

### Process Communication
Both AMP and Claude Code use external CLI processes:
- **Read:** Prompt on stdin (UTF-8), stdin closed to signal EOF
- **Write:** Streaming JSON lines on stdout (one JSON object per line)
- **Flags:** 
  - Claude: `--output-format=stream-json`
  - AMP: `--stream-json`

### Claude JSON Protocol (Also Used by AMP)

Modeled in `ClaudeJson` enum:

**Message Types:**
- `system` | `assistant` | `user` | `tool_use` | `tool_result` | `result`

**Content Structure:**
```json
{
  "message": {
    "role": "assistant",
    "model": "...",
    "content": [
      {
        "type": "text",
        "text": "..."
      },
      {
        "type": "thinking",
        "thinking": "..."
      },
      {
        "type": "tool_use",
        "name": "write_file",
        "input": {
          "file_path": "...",
          "content": "..."
        }
      }
    ]
  }
}
```

**Tool Calls:**
Structured `ClaudeToolData` with serde aliases for AMP compatibility:
- `Write` with aliases: `"create_file"`, `"write_file"`
- `Edit` with alias: `"edit_file"`
- `Bash` with aliases: `"cmd"`, `"command_line"`
- `Glob`, `Grep`, `Read`, `LS`, and others

**Session ID:**
- Appears on `system`, `assistant`, `tool_use`, `tool_result`, or `result` variants
- Extracted to `MsgStore` via `ClaudeLogProcessor::extract_session_id`

### Normalization Process

`ClaudeLogProcessor::process_logs`:
- Reads stdout line by line
- Parses JSON
- Emits `ConversationPatch` messages with `NormalizedEntry`:
  - **SystemMessage:** "System initialized with model: …"
  - **AssistantMessage:** Text chunks
  - **ToolUse:** Condensed action type (FileEdit, CommandRun, Search, WebFetch, etc.)
  - **ErrorMessage:** API key warnings, etc.
  - **Thinking:** Reasoning content
  - **Tool results:** Structured (e.g., `CommandRunResult` for Bash)
- Stderr normalized separately by `logs/stderr_processor.rs`

### AMP Follow-up Pattern
```bash
# Step 1: Fork the session
npx ... threads fork <session_id>  # Returns new thread id

# Step 2: Continue with new prompt
npx ... threads continue <new_thread_id>  # Write prompt to stdin
```

## 3. Base Executor Interface

**File:** `crates/executors/src/executors/mod.rs`

**Trait:** `StandardCodingAgentExecutor` (async_trait)

```rust
#[async_trait]
pub trait StandardCodingAgentExecutor {
    async fn spawn(&self, current_dir, prompt) 
        -> Result<SpawnedChild, ExecutorError>;
    
    async fn spawn_follow_up(&self, current_dir, prompt, session_id) 
        -> Result<SpawnedChild, ExecutorError>;
    
    fn normalize_logs(&self, raw_logs_store, worktree_path);
    
    fn default_mcp_config_path(&self) -> Option<PathBuf>;
    
    async fn check_availability(&self) -> bool {
        // Default: config path exists
    }
}
```

### Registration and Selection

**Enum dispatch:**
- `CodingAgent` enum wraps all implementations
- Variants: `ClaudeCode`, `Amp`, `Cursor`, etc.
- Uses `enum_dispatch` to bind methods to trait

**Profile-based selection:**
- `ExecutorProfileId { executor: BaseCodingAgent, variant?: String }`
- `ExecutorConfigs` loads defaults from `default_profiles.json`
- Overlays user overrides from `profiles.json`
- Actions lookup via `ExecutorConfigs::get_coding_agent`

**Capabilities:**
- `CodingAgent::capabilities` returns features like `SessionFork`
- Used by frontend to gate UI features

**MCP config:**
- `CodingAgent::get_mcp_config` returns server-key paths
- Preconfigured transformations per executor

## 4. Message Flow

### End-to-End Flow

1. **TaskAttempt Started** (`ContainerService.start_attempt`)
   - Run setup script (if exists) → chain `CodingAgentInitialRequest`
   - OR run `CodingAgentInitialRequest` directly
   - Create `ExecutionProcess` DB row with serialized `ExecutorAction`
   - Create `ExecutorSession` DB row (prompt/session_id/summary)

2. **Start Process**
   - Container calls `ExecutorAction.spawn`
   - Dispatches to `CodingAgentInitialRequest.spawn`
   - Executor builds CLI command (`CommandBuilder` + overrides)
   - Spawns process with stdin/stdout/stderr piped
   - Writes prompt to stdin, then closes to signal EOF
   - Child tracked; stdout/stderr streamed to `MsgStore` and DB as JSONL

3. **Normalization**
   - Container calls `executor.normalize_logs(msg_store, worktree_dir)`
   - Background task reads `MsgStore` stdout JSON lines
   - Parses into normalized UI patches (`JsonPatch` with `NormalizedEntry`)
   - Pushes `session_id` when observed

4. **Completion**
   - Exit monitor waits for process exit OR `SpawnedChild.exit_signal`
   - Updates `ExecutionProcess` status/exit_code
   - Commits changes (`try_commit_changes`)
   - Starts `next_action` (cleanup script) if configured
   - Finalizes status and computes `after_head_commit`
   - Updates `ExecutorSession` summary with last assistant message

### Follow-ups
- Frontend collects `session_id` from normalized stream
- Server persists to `ExecutorSession` when `LogMsg::SessionId` seen
- `CodingAgentFollowUpRequest` uses saved `session_id`:
  - Claude: `--fork-session --resume <session_id>`
  - AMP: `threads fork/continue` pattern
- Normalization works same on new process

## 5. Adding a New Executor

### Configuration Patterns

**Profiles:**
- **Default:** `crates/executors/default_profiles.json`
- **User overrides:** `profiles.json` (via `workspace_utils::assets::profiles_path()`)

**Schema Generation:**
- Derive `TS` and `JsonSchema` on config struct
- Frontend loads from `shared/schemas` via Vite plugin (`frontend/vite.config.ts`)
- Renders config forms dynamically

**MCP Configs:**
- `default_mcp_config_path`: Where executor expects MCP config
- `CodingAgent::get_mcp_config`:
  - Server path keys: `"mcpServers"`, `"amp.mcpServers"`, `"mcp"`, `"mcp_servers"`
  - `is_toml_config` flag
  - Preconfigured adapters in `mcp_config.rs`

### Implementation Checklist

#### 1. Code Structure
Create `crates/executors/src/executors/<your_executor>.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct YourExecutorConfig {
    // Common fields
    append_prompt: AppendPrompt,
    cmd: CmdOverrides,
    
    // Custom flags
    // ... add schemars annotations for form UX
}

#[async_trait]
impl StandardCodingAgentExecutor for YourExecutor {
    async fn spawn(&self, current_dir, prompt) -> Result<SpawnedChild, ExecutorError> {
        // Build CLI with CommandBuilder
        // Set --output-format=stream-json (or equivalent)
        // Write prompt to stdin
    }
    
    async fn spawn_follow_up(&self, current_dir, prompt, session_id) 
        -> Result<SpawnedChild, ExecutorError> {
        // Build resume/fork arguments with session_id
    }
    
    fn normalize_logs(&self, raw_logs_store, worktree_path) {
        // Option 1: Reuse ClaudeLogProcessor if JSON matches Claude/AMP
        // Option 2: Implement custom parser (see Cursor example)
        // Always call normalize_stderr_logs
    }
    
    fn default_mcp_config_path(&self) -> Option<PathBuf> {
        // Return where executor expects MCP config
    }
    
    async fn check_availability(&self) -> bool {
        // Optional: Look for CLI in PATH
    }
}
```

#### 2. Register Executor
In `crates/executors/src/executors/mod.rs`:
- Add variant to `CodingAgent` enum
- Import your module
- Add `get_mcp_config` arm if needed
- Update `mcp_config.rs` if custom adapter needed
- Add to `default_profiles.json`
- Update `capabilities` if relevant

#### 3. Types and Schemas
- Ensure `TS`/`JsonSchema` derivations exist
- Run `npm run generate-types` to generate `shared/types.ts` and schemas

#### 4. Frontend
- Executor settings UI auto-discovers schemas via `vite virtual:executor-schemas`
- No manual wiring needed if schema generated correctly

#### 5. Follow-ups
- Ensure `normalize_logs` extracts and pushes `session_id` to `MsgStore`
- Server captures and persists to `ExecutorSession`

## 6. Key Structs and Code Pointers

### JSON Protocol
- **Claude:** `ClaudeJson`, `ClaudeContentItem`, `ClaudeToolData`, `ClaudeLogProcessor` (`claude.rs`)
- **Common logs:** `crates/executors/src/logs/mod.rs`
- **Cursor:** Example of custom typed JSON model and tool mapping

### Core Components
- **AMP:** `crates/executors/src/executors/amp.rs`
- **Claude:** `crates/executors/src/executors/claude.rs`
- **Base trait:** `crates/executors/src/executors/mod.rs`
- **Actions:** `crates/executors/src/actions/*`
- **Profiles:** `crates/executors/src/profile.rs`, `default_profiles.json`
- **Normalization:** `crates/executors/src/logs/*`
- **Container orchestration:**
  - Server: `crates/services/src/services/container.rs`
  - Local: `crates/local-deployment/src/container.rs`
- **MCP config:** `crates/executors/src/mcp_config.rs`
- **Frontend schemas:** `frontend/vite.config.ts` (executorSchemasPlugin)
- **Config forms:** `frontend/src/components/ExecutorConfigForm.tsx`

## 7. Practical Tips

### JSON Protocol Compatibility
- If stdout JSON matches Claude/AMP: **Reuse `ClaudeLogProcessor`**
- For custom JSON: Implement typed parser (see Cursor example)
- Map tool results to `ActionType` for UI rendering
- Coalesce assistant messages in streaming fashion

### Process Management
- If executor never exits on its own: Return `SpawnedChild` with `exit_signal` (oneshot::Receiver)
- Container exit monitor handles this gracefully

### Session Management
- Always push `session_id` early to `MsgStore`
- Server persists to `ExecutorSession` for follow-ups
- Prevents race conditions

### Mixed Output Handling
- If logs mix JSON and plaintext:
  - Try JSON parsing first
  - On failure: Treat as plaintext via `PlainTextLogProcessor`
  - Convert to `ErrorMessage`

### Tool Mappings
- Keep condensed and helpful
- UI relies on `ActionType` for readable tool cards

### MCP Configuration
- Decide config path and format (JSON vs TOML)
- Implement adapter in `mcp_config.rs` if shape deviates
- Example: `"amp.mcpServers"` vs `"mcpServers"`

### Schema Annotations
- Use `schemars` attributes for rich form hints
- Titles, descriptions feed frontend config UI

## Documentation References

- **CLAUDE.md:** Mentions "Executor Pattern" and pluggable executors
- **docs/configuration-customisation/agent-configurations.mdx:** Profile structure, variants, schema-driven forms
- **Code:** Primary source of truth for protocol handling

## Droid Exec Integration Considerations

For implementing a "droid exec" style executor similar to the Factory droid documentation:

### Key Alignment Points

1. **Non-Interactive Execution:** Matches existing executor pattern (spawn → execute → exit)
2. **JSON Output:** Compatible with Claude/AMP protocol (can use `--output-format debug` for JSONL)
3. **Session Continuity:** `--session-id` flag maps to follow-up pattern
4. **Autonomy Levels:** Could map to executor capabilities/permissions
5. **Output Formats:** text/json/debug modes align with normalization patterns

### Implementation Approach

**Spawn Command:**
```bash
droid exec --output-format debug "task description"
```

**Follow-up Command:**
```bash
droid exec --session-id <id> --output-format debug "follow-up task"
```

**JSON Protocol:**
- Droid's `--output-format debug` produces JSONL
- Parse into `ClaudeJson`-compatible format OR implement custom parser
- Extract `session_id` from output for follow-ups

**Autonomy Mapping:**
- Default (read-only) → Spec mode
- `--auto low` → File operations
- `--auto medium` → Dev operations  
- `--auto high` → Production operations

**Configuration:**
```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct DroidConfig {
    append_prompt: AppendPrompt,
    cmd: CmdOverrides,
    autonomy_level: Option<String>,  // "low" | "medium" | "high"
    model: Option<String>,
    reasoning_effort: Option<String>,  // "off" | "low" | "medium" | "high"
}
```
