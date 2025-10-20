# Pure Functional Reducer Design

## Architecture: Functional Core, Imperative Shell

```
Text Stream → DroidJson → [Pure Core] → Effects → [Adapter] → Patches → MsgStore
                            ↓
                          State
```

### Pure Core (Testable)
```rust
fn reduce_core(
    state: DroidReducerState, 
    event: &DroidJson
) -> (DroidReducerState, Vec<ReducerEffect>)
```

**Properties:**
- Takes ownership of state (move, not clone)
- Returns new state + domain effects
- No indices, no external dependencies
- Easy to test: feed events, assert (state, effects)

### Imperative Shell (Existing API)
```rust
impl DroidReducerState {
    fn reduce(&mut self, event: &DroidJson, indexer: &dyn IndexProviderLike) 
        -> Vec<json_patch::Patch> 
    {
        let (new_state, effects) = reduce_core(mem::take(self), event);
        *self = new_state;
        effects_to_patches(&effects, indexer)
    }
}
```

**Benefits:**
- Keeps existing call sites unchanged
- Pure core is testable without MsgStore/indices
- Same performance as `&mut` (moves, not clones)

## Data Model

### State (What persists across events)
```rust
struct DroidReducerState {
    // Track pending tool calls awaiting results
    tool_map: HashMap<String, PendingToolCall>,
    
    // Prevent duplicate model reporting
    model_reported: bool,
    
    // Optional: handle out-of-order results
    pending_results: HashMap<String, PendingToolResult>,
}

struct PendingToolCall {
    tool_name: String,
    tool_call_id: String,      // Stable ID, not index
    message_id: String,
    action_type: ActionType,
    content: String,
    timestamp: u64,
}

struct PendingToolResult {
    tool_call_id: String,
    payload: ToolResultPayload,
    is_error: bool,
    timestamp: u64,
}
```

### Effects (Domain-level output, no indices)
```rust
enum ReducerEffect {
    // Append a new log entry
    AppendEntry {
        message_id: String,
        entry_type: NormalizedEntryType,
        content: String,
        metadata: Option<serde_json::Value>,
        timestamp: Option<u64>,
    },
    
    // Update an existing tool call's status
    UpdateToolStatus {
        tool_call_id: String,
        message_id: String,
        status: ToolStatus,
        action_type: ActionType,
        content: String,
    },
    
    // Diagnostic for malformed events
    EmitWarning {
        message: String,
    },
}
```

### Adapter (Effects → Patches)
```rust
fn effects_to_patches(
    effects: &[ReducerEffect],
    indexer: &dyn IndexProviderLike,
    tool_index_map: &HashMap<String, usize>, // tool_call_id -> index
) -> Vec<json_patch::Patch>
```

**Responsibilities:**
- Assign indices using IndexProviderLike
- Track tool_call_id → index mapping
- Generate ConversationPatch operations
- All index math lives here

## Implementation Steps

### Step 1: Add ReducerEffect enum
Define the effect types representing domain operations without indices.

### Step 2: Create pure reduce_core
```rust
fn reduce_core(
    mut state: DroidReducerState,
    event: &DroidJson,
) -> (DroidReducerState, Vec<ReducerEffect>) {
    match event {
        DroidJson::ToolCall { id, .. } => {
            state.tool_map.insert(id.clone(), PendingToolCall { ... });
            let effects = vec![ReducerEffect::AppendEntry { ... }];
            (state, effects)
        }
        DroidJson::ToolResult { id, payload, .. } => {
            if let Some(call) = state.tool_map.remove(id) {
                let effects = vec![ReducerEffect::UpdateToolStatus { ... }];
                (state, effects)
            } else {
                // Out of order: buffer or warn
                state.pending_results.insert(id.clone(), ...);
                (state, vec![])
            }
        }
        // ... other cases
    }
}
```

### Step 3: Create effects_to_patches adapter
```rust
fn effects_to_patches(
    effects: &[ReducerEffect],
    indexer: &dyn IndexProviderLike,
    tool_index_map: &mut HashMap<String, usize>,
) -> Vec<json_patch::Patch> {
    effects.iter().flat_map(|effect| {
        match effect {
            ReducerEffect::AppendEntry { message_id, entry_type, .. } => {
                let idx = indexer.next();
                // Store mapping for UpdateToolStatus later
                if let NormalizedEntryType::ToolUse { .. } = entry_type {
                    tool_index_map.insert(message_id.clone(), idx);
                }
                vec![ConversationPatch::add_normalized_entry(idx, ...)]
            }
            ReducerEffect::UpdateToolStatus { tool_call_id, .. } => {
                let idx = tool_index_map[tool_call_id];
                vec![ConversationPatch::replace(idx, ...)]
            }
            // ...
        }
    }).collect()
}
```

### Step 4: Update wrapper to use pure core
```rust
impl DroidReducerState {
    fn reduce(
        &mut self,
        event: &DroidJson,
        indexer: &dyn IndexProviderLike,
    ) -> Vec<json_patch::Patch> {
        let (new_state, effects) = reduce_core(
            std::mem::take(self),  // Move state out
            event
        );
        *self = new_state;  // Move new state back
        
        effects_to_patches(&effects, indexer, &mut self.tool_index_map)
    }
}
```

### Step 5: Update DroidLogProcessor
Add tool_index_map to track tool_call_id → index mappings for the adapter.

### Step 6: Write tests for pure core
```rust
#[test]
fn test_pure_tool_call_and_error() {
    let state = DroidReducerState::default();
    
    let tool_call = DroidJson::ToolCall { ... };
    let (state, effects) = reduce_core(state, &tool_call);
    
    assert_eq!(effects.len(), 1);
    assert!(matches!(effects[0], ReducerEffect::AppendEntry { .. }));
    assert_eq!(state.tool_map.len(), 1);
    
    let tool_result = DroidJson::ToolResult { error: ..., ... };
    let (state, effects) = reduce_core(state, &tool_result);
    
    assert_eq!(effects.len(), 1);
    assert!(matches!(effects[0], ReducerEffect::UpdateToolStatus { 
        status: ToolStatus::Failed, .. 
    }));
    assert_eq!(state.tool_map.len(), 0);
}
```

## Benefits

✅ **Testability**: Pure core tests don't need MsgStore/IndexProvider  
✅ **Performance**: Same as `&mut` (moves, not clones)  
✅ **Clarity**: State vs Effects vs Adapter separation  
✅ **Idiomatic**: Keeps existing `&mut self` API  
✅ **Robustness**: Can add out-of-order handling, idempotency  

## Comparison to Current

**Before:**
- `reduce(&mut self, event, indexer) -> Patches`
- Mixes domain logic with index assignment
- Hard to test without IndexProvider

**After:**
- `reduce_core(state, event) -> (state, Effects)` ← pure, easy to test
- `effects_to_patches(effects, indexer) -> Patches` ← adapter
- `reduce(&mut self, event, indexer) -> Patches` ← wrapper (unchanged API)

## Migration Strategy

1. Add ReducerEffect enum alongside existing code
2. Implement reduce_core that returns effects
3. Implement effects_to_patches adapter
4. Update wrapper to delegate to reduce_core
5. Migrate tests to use reduce_core
6. Remove old imperative logic

## Open Questions

1. Should tool_index_map be part of DroidReducerState or passed separately to adapter?
2. Do we need pending_results for out-of-order handling, or is tool call always first?
3. Should we scope state by session_id or assume one reducer per session?
