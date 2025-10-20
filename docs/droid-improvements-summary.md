# Droid Executor Architecture - Simplified

## Summary
Simplified the droid executor architecture based on code review, focusing on clarity and removing unnecessary abstractions.

## Final Architecture

### Simple, Clear Flow
```
Processor
  ├─ parse DroidJson from stream
  ├─ process_event(state, event) → (new_state, Vec<DomainEvent>)
  └─ emit_patches(events, index_provider) → JSON Patches
```

### Files
- **`events.rs`** (renamed from `reducer.rs`): Pure event processing - `DroidJson` → `DomainEvent`
- **`patch_emitter.rs`**: Converts `DomainEvent` → `ConversationPatch` using index provider
- **`processor.rs`**: Orchestrates the stream processing pipeline
- **`types.rs`**: DroidJson and tool data types
- **`action_mapper.rs`**: Tool call → ActionType mapping

## Key Simplifications

### 1. Removed Unnecessary Types
- ❌ Deleted `newtypes.rs` - No need for `CorrId` or `EntryIdx` wrappers
- ✅ Use plain `String` for `tool_call_id` throughout

### 2. Better Naming
- ❌ `reducer.rs` / `reduce_pure()` - confusing Redux terminology
- ✅ `events.rs` / `process_event()` - clear, domain-appropriate
- ❌ `ReducerState` 
- ✅ `ProcessorState` - matches what it actually is

### 3. Clearer Separation of Concerns
**DomainEvent is now a lightweight wrapper over NormalizedEntry:**
```rust
enum DomainEvent {
    AddEntry(NormalizedEntry),
    AddToolCall { tool_call_id: String, entry: NormalizedEntry },
    UpdateToolCall { tool_call_id: String, entry: NormalizedEntry },
}
```

**Why this is better:**
- `process_event()` creates `NormalizedEntry` directly (no index provider needed)
- `emit_patches()` only needs index provider to create patches
- Clear responsibility: events contain what to add/update, patches contain where

### 4. Simpler Correlation Tracking
- Store `toolCallId` (not `corrId`) in metadata to match field naming conventions
- Warn with `tracing::warn!()` when correlation is missing
- No complex resolver trait - implement recovery only if needed

## What the Oracle Was Right About

✅ **Keep DomainEvent abstraction** - Separates domain logic from presentation  
✅ **Store correlation ID in metadata** - Enables future recovery  
✅ **Warn on missing correlations** - Better than silent failures  

## What We Simplified Further

❌ **Removed CorrIdResolver trait** - Over-engineered for uncertain problem  
❌ **Removed Transducer** - Unnecessary layer  
❌ **Removed CorrId newtype** - Plain String is clearer  
❌ **Removed excessive logging** - Only warn on actual issues  

## Testing

All tests pass:
```
test result: ok. 8 passed; 0 failed; 0 ignored
```

Tests:
- `test_droid_json_parsing` (in types.rs)
- `test_process_tool_call_and_error_result` (in events.rs)
- 6 action_mapper tests

## Build Status
✅ `cargo check` passes with zero warnings  
✅ All 8 tests pass

## Key Insights

1. **DomainEvent as NormalizedEntry wrapper** is the right abstraction - it carries both the data (NormalizedEntry) and the operation intent (add vs update + correlation)

2. **Index provider only needed at patch creation** - separates "what to do" from "where to put it"

3. **Simpler names > Redux patterns** - `process_event` is clearer than `reduce_pure` when you're not doing functional programming

4. **Plain types work fine** - newtypes add ceremony without value when the usage is clear from context
