# Droid Failed Tool Result Correlation Bug - Refactoring Plan

## Problem Statement

When a droid tool call fails with `isError: true`, the tool result contains an `error` field instead of a `value` field. The current `DroidJson::ToolResult` struct only expects a `value` field, causing deserialization to fail. This prevents the failed result from being correlated with its originating tool call, resulting in:
- The tool call appearing as "in progress" indefinitely
- The error appearing as a separate, unrelated UI element

**Example**: See `droid-json/insufficient-perms.jsonl` line 8.

## Root Causes

1. **Deserialization bug**: `ToolResult` struct expects `value: serde_json::Value` but error results have `error: { type, message }`
2. **Lack of testability**: Logic is embedded in async streaming code with tight coupling to `MsgStore`, making unit testing difficult

## Refactoring Goals

1. Fix deserialization to handle both success and error tool results
2. Extract pure reducer function for testability
3. Write comprehensive unit tests for tool call correlation
4. Maintain existing async streaming architecture

## Implementation Plan

### Phase 1: Extract Pure Reducer (Enable TDD)

**Define trait for index provider**:

```rust
trait IndexProviderLike {
    fn next(&mut self) -> usize;
}
```

**Create reducer state struct**:

```rust
#[derive(Default)]
struct DroidReducerState {
    tool_map: HashMap<String, ToolCallInfo>,
    model_reported: bool,
    session_id: Option<String>,
}

impl DroidReducerState {
    fn reduce(
        &mut self,
        event: &DroidJson,
        entry_index_provider: &mut dyn IndexProviderLike
    ) -> Vec<ConversationPatch> {
        // Pure transformation of event -> patches
        // Move logic from normalize_entries here
    }
}
```

**Refactor `DroidLogProcessor`**:
- Keep as async streaming wrapper
- Instantiate `DroidReducerState` 
- Call `state.reduce(event, &mut provider)` for each event
- Apply returned patches to `MsgStore`

### Phase 2: Write Failing Test

Write `test_reduce_tool_call_and_error_result` that expects error results to be properly correlated. This test will fail because `DroidJson::ToolResult` cannot deserialize error payloads yet.

### Phase 3: Fix Deserialization (Make Test Pass)

**Add error payload support to `DroidJson::ToolResult`**

```rust
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
pub struct ToolError {
    #[serde(rename = "type")]
    pub kind: String,
    pub message: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(untagged)]
enum ToolResultPayload {
    Value { value: serde_json::Value },
    Error { error: ToolError },
}

impl ToolResultPayload {
    pub fn value(&self) -> Option<&serde_json::Value> {
        match self {
            ToolResultPayload::Value { value } => Some(value),
            _ => None,
        }
    }
    
    pub fn error(&self) -> Option<&ToolError> {
        match self {
            ToolResultPayload::Error { error } => Some(error),
            _ => None,
        }
    }
}
```

**Update `DroidJson::ToolResult` variant**:

```rust
ToolResult {
    id: String,
    #[serde(rename = "messageId")]
    message_id: String,
    #[serde(rename = "toolId")]
    tool_id: String,
    #[serde(rename = "isError")]
    is_error: bool,
    #[serde(flatten)]
    payload: ToolResultPayload,  // Replaces `value` field
    timestamp: u64,
    session_id: String,
}
```

**Update usages** (lines 410-484):
- Replace `value` with `payload.value()` for success cases
- Use `payload.error()` for error cases
- Only call `parse_apply_patch_result` when `payload.value()` is `Some`

### Phase 4: Add Remaining Tests

**Test 1: Error deserialization**
```rust
#[test]
fn test_tool_result_error_deserialization() {
    let line = r#"{"type":"tool_result",...,"isError":true,"error":{"type":"tool_error","message":"Error: tool execution cancelled"},...}"#;
    let parsed: DroidJson = serde_json::from_str(line).expect("should parse");
    // Assert error fields are correctly parsed
}
```

**Test 2: Tool call + success result correlation**
```rust
#[test]
fn test_reduce_tool_call_and_success_result() {
    // Similar to above but with successful result
}
```

**Test 3: End-to-end from JSONL**
```rust
#[test]
fn test_parse_insufficient_perms_jsonl_end_to_end() {
    // Parse all lines from insufficient-perms.jsonl
    // Feed into reducer
    // Assert complete flow: tool call created -> error result correlated
}
```

### Phase 5: Polish

**Error result formatting**:
- When `is_error` is true and we have `payload.error()`, format error message for display
- Include both `error.kind` and `error.message` in tool status

**Success result parsing**:
- Gate `parse_apply_patch_result` to only execute when `payload.value().is_some()`
- For error payloads, skip result parsing and just show error

## Migration Checklist (TDD Order)

**Phase 1: Refactor for testability**
- [ ] Add `IndexProviderLike` trait
- [ ] Create `DroidReducerState` and move logic from `normalize_entries`
- [ ] Update `process_logs` to use reducer
- [ ] Run existing test suite for regressions

**Phase 2: Write failing test**
- [ ] Add test: `test_reduce_tool_call_and_error_result` (WILL FAIL)

**Phase 3: Fix bug**
- [ ] Add `ToolError` and `ToolResultPayload` types
- [ ] Update `DroidJson::ToolResult` to use `payload` field
- [ ] Update reducer logic to handle `payload.error()`
- [ ] Test should now pass ✅

**Phase 4: Additional tests**
- [ ] Add test: error deserialization
- [ ] Add test: success result correlation (regression check)
- [ ] Add test: end-to-end JSONL parsing

**Phase 5: Polish**
- [ ] Update error display logic to show `error.message`
- [ ] Run full test suite

## Testing Strategy

**Unit tests**: Test reducer logic in isolation with fake index provider
**Integration test**: Parse real JSONL file and verify complete flow
**Regression tests**: Ensure existing ApplyPatch tests still pass

## Benefits

✅ Fixes tool result correlation for error cases  
✅ Makes correlation logic testable  
✅ Enables TDD for future changes  
✅ Maintains existing async streaming architecture  
✅ No breaking changes to downstream consumers  

## Risks & Mitigations

**Risk**: Existing code depends on `value` field  
**Mitigation**: Use `payload.value()` which returns `Option`, maintains type safety

**Risk**: Breaking test suite  
**Mitigation**: Run tests after each phase, fix incrementally
