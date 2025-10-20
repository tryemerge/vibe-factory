# Droid Error Correlation Bug Fix & Refactoring Summary

## Problem
When droid tool calls failed with `isError: true`, the error result contained an `error` field instead of `value`, causing deserialization to fail. This prevented the error from being correlated with its tool call, resulting in:
- Tool calls appearing "in progress" indefinitely
- Error messages appearing as separate, unrelated UI elements

## Solution

### Phase 1: TDD Bug Fix
1. **Added IndexProviderLike trait** - abstraction for testing
2. **Extracted DroidReducerState** - separated state from async processing
3. **Wrote failing test** - `test_reduce_tool_call_and_error_result`
4. **Fixed deserialization**:
   - Added `ToolError` struct
   - Added `ToolResultPayload` enum (Value | Error)
   - Updated `DroidJson::ToolResult` to use `payload` field
5. **Test passed** ✅

### Phase 2: Architecture Refactoring
Refactored from single 1000-line file to modular architecture with clean separation of concerns.

## New Architecture

```
crates/executors/src/executors/droid/
├── types.rs       - Data types (DroidJson, ToolError, etc.)
├── pure.rs        - Pure reducer logic (testable without IO)
├── impure.rs      - Index assignment & patch emission
├── processor.rs   - Async streaming (DroidLogProcessor)
└── mod.rs         - Public API & tests
```

### types.rs
- `DroidJson` - Streaming JSON events from droid
- `ToolError` - Error payload structure
- `ToolResultPayload` - Union of Value | Error
- `DroidToolData` - Tool-specific parameters

### pure.rs - Functional Core
**Pure function**: `(ReducerState, DroidJson) → (ReducerState, Vec<DomainEvent>, Option<SessionId>)`

```rust
pub struct ReducerState {
    tool_map: HashMap<String, PendingToolCall>,  // Pending tool calls
    model_reported: bool,
}

pub enum DomainEvent {
    NewEntry { ... },              // Uncorrelated log entry
    NewToolCall { corr_id, ... },  // Tool call awaiting result
    UpdateToolCall { corr_id, ... }, // Tool result correlation
}
```

**Key properties:**
- ✅ No indices (domain-level only)
- ✅ No IO or side effects
- ✅ Easy to test with plain assertions
- ✅ All correlation logic in one place

### impure.rs - Index Assignment
**Impure adapter**: `(Vec<DomainEvent>, IndexProvider) → Vec<Patch>`

```rust
pub struct PatchEmitter {
    corr_idx: HashMap<String, usize>,  // corr_id → entry_index mapping
}
```

**Responsibilities:**
- Assign indices using `IndexProviderLike`
- Track `tool_call_id → index` for updates
- Generate `ConversationPatch` operations
- All index math isolated here

### processor.rs - Async Streaming
- Reads stdout stream from `MsgStore`
- Parses text → `DroidJson`
- Calls pure reducer
- Emits patches via `PatchEmitter`
- Handles partial lines and session ID extraction

### mod.rs - Public API
- Re-exports `Droid` and `Autonomy`
- Implements `StandardCodingAgentExecutor` trait
- All tests (8 tests, all passing)

## Benefits

### Testability
- **Pure reducer** testable without `MsgStore` or `IndexProvider`
- **Fake implementations** for testing (e.g., `FakeIndexProvider`)
- **Unit tests** for correlation logic independent of IO

### Clarity
- **Separation of concerns**: Pure logic vs IO vs index assignment
- **Domain events** describe what happened, not how to render it
- **No mixed responsibilities**: Each module has one clear purpose

### Maintainability
- **~1000 lines** → **5 focused modules**
- **Pure functions** easier to reason about and modify
- **Clear data flow**: `DroidJson → DomainEvent → Patch`

### Performance
- **Same as before**: Uses moves, not clones
- **No allocations overhead**: State consumed and returned
- **Efficient HashMap lookups**: O(1) tool call correlation

## Test Coverage

### Existing Tests (All Passing)
1. `test_droid_json_parsing` - Deserialization of all JSON types
2. `test_parse_apply_patch_with_diff` - ApplyPatch result parsing
3. `test_parse_apply_patch_with_content` - File content creation
4. `test_parse_apply_patch_with_nested_value` - Nested JSON structures
5. `test_parse_apply_patch_from_json_string` - String-encoded JSON
6. `test_parse_apply_patch_missing_file_path` - Error handling
7. `test_parse_apply_patch_no_diff_or_content` - Empty changes
8. `test_reduce_tool_call_and_error_result` - **Error correlation bug fix** ✅

### Test Architecture
```rust
// Pure reducer tests - no IndexProvider needed
let (state, events, _) = reduce_pure(state, &event);
assert_eq!(events.len(), 1);
assert!(matches!(events[0], DomainEvent::NewToolCall { .. }));

// Integration tests with FakeIndexProvider
let mut emitter = PatchEmitter::new();
let patches = emitter.emit_patches(events, &fake_provider);
```

## What Changed

### Before
```
droid.rs (1000+ lines)
├── Mixed concerns: parsing + correlation + indices + async
├── Hard to test: needs MsgStore + IndexProvider
└── Mutation-based: &mut self everywhere
```

### After
```
droid/
├── types.rs       - Just data types
├── pure.rs        - Pure reducer (testable)
├── impure.rs      - Index concerns (isolated)
├── processor.rs   - Async IO (thin wrapper)
└── mod.rs         - API + tests
```

## Key Design Decisions

1. **Pure core, impure shell** - Functional core with imperative boundaries
2. **Domain events, not patches** - Decouple semantics from rendering
3. **Stable IDs in core** - Use `tool_call_id`, not indices
4. **Index assignment in adapter** - All index math in one place
5. **Keep existing API** - No breaking changes to callers

## Migration Path
- ✅ Old `droid.rs` deleted
- ✅ New `droid/` module structure
- ✅ All tests passing
- ✅ No API changes required
- ✅ Ready for production

## Future Improvements

### Potential Enhancements
- **Out-of-order handling**: Buffer results that arrive before calls
- **Idempotency**: Deduplicate duplicate events
- **Session scoping**: Support multiple sessions per reducer
- **Time-travel debugging**: Replay events for debugging

### Already Supported
- ✅ Error correlation
- ✅ Tool call/result matching
- ✅ Model reporting
- ✅ Session ID extraction
- ✅ Stderr integration

## Verification

```bash
cargo test --package executors --lib executors::droid
# running 8 tests
# test result: ok. 8 passed; 0 failed; 0 ignored
```

All tests pass, bug fixed, architecture improved! 🎉
