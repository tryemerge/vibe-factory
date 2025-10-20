# ADR: Droid Executor Architecture - Separation of Concerns

## Status
Accepted

## Context
The droid executor processes streaming JSON logs from the `droid exec` command. The original architecture used a separation between:
- **Reducer**: Pure state machine that processes `DroidJson` events
- **DomainEvent**: Intermediate representation of domain semantics
- **PatchEmitter**: Translates domain events into JSON patches for the UI

There was a question of whether the `DomainEvent` abstraction was necessary or if the reducer should emit patches directly.

## Decision
We decided to **keep the DomainEvent abstraction** and strengthen the architecture with the following improvements:

### 1. Maintain Separation of Concerns
- **Reducer** (`reducer.rs`): Pure state machine on domain input → (new state, domain events)
  - Handles business logic: tool call tracking, message processing
  - Free of presentation concerns (UI indices, patch format)
  - Easily testable in isolation

- **DomainEvent**: Clean boundary between domain semantics and presentation
  - `NewEntry`: New conversation entry (user/assistant/system message)
  - `NewToolCall`: New tool invocation with correlation ID
  - `UpdateToolCall`: Tool result with status update

- **PatchEmitter** (`patch_emitter.rs`): Presentation layer
  - Translates domain events into JSON patches
  - Maintains correlation ID → entry index mapping (`corr_idx`)
  - Handles UI-specific concerns

### 2. Type Safety with Newtypes
Introduced type-safe wrappers to prevent ID mix-ups:
```rust
pub struct CorrId(String);  // Correlation ID for tool calls
pub struct EntryIdx(usize);  // UI entry index
```

### 3. Restart Resilience
**Problem**: If the process restarts between `NewToolCall` and `UpdateToolCall`, the `corr_idx` mapping is lost.

**Solution**: 
- Include `corrId` in the metadata for `NewToolCall` entries
- Add optional `CorrIdResolver` trait for recovery
- Emit warnings when `UpdateToolCall` arrives with unknown correlation ID

```rust
pub trait CorrIdResolver {
    fn resolve_corr_id(&self, corr_id: &CorrId) -> Option<usize>;
}
```

### 4. Composition Layer (Transducer)
Created a thin `Transducer` that composes reducer + emitter for cleaner call sites:
```rust
pub struct Transducer {
    reducer_state: ReducerState,
    patch_emitter: PatchEmitter,
}

impl Transducer {
    pub fn step(&mut self, droid_json: &DroidJson, index_provider: &dyn IndexProviderLike) 
        -> Vec<json_patch::Patch>
}
```

This simplifies the processor while keeping internal boundaries intact.

### 5. Observability
Added structured logging throughout:
- Reducer: logs event type, tool map size, tool calls added/removed
- PatchEmitter: logs index assignment, correlation mappings, missing correlation warnings
- Processor: logs parsing progress, patch emission

## Consequences

### Benefits
1. **Testability**: Each layer can be tested independently
   - Reducer: pure function tests with deterministic inputs
   - PatchEmitter: tests with fake index providers
   - Transducer: integration tests of the complete flow

2. **Extensibility**: Can add new consumers of domain events (metrics, audit logs, database writers) without touching the reducer

3. **Maintainability**: Clear boundaries make it easier to understand and modify each component

4. **Resilience**: Recovery mechanism handles process restarts gracefully

5. **Type Safety**: Newtypes prevent ID confusion at compile time

### Trade-offs
1. **Complexity**: More abstraction layers than direct patch emission
2. **Performance**: Small overhead from cloning state and intermediate allocations (negligible in practice)
3. **Code Volume**: More code to maintain across multiple files

## Alternatives Considered

### Alternative 1: Collapse Reducer into PatchEmitter
**Rejected because**:
- Reducer would need to maintain both domain state and presentation state
- Harder to test the core business logic
- Loses ability to add alternate consumers
- Breaks single responsibility principle

### Alternative 2: Make PatchEmitter Stateless
**Rejected because**:
- Correlation mapping is necessary for replacing tool call entries
- Would require scanning all entries on every update (O(n) vs O(1))
- State is presentation-level and belongs in the emitter

## Implementation Notes

### File Structure
```
crates/executors/src/executors/droid/
├── mod.rs              # Module exports
├── newtypes.rs         # Type-safe ID wrappers
├── types.rs            # DroidJson and tool data types
├── reducer.rs          # Pure reducer (domain → events)
├── patch_emitter.rs    # Event → JSON patch translator
├── transducer.rs       # Composition of reducer + emitter
├── processor.rs        # Stream processing pipeline
└── action_mapper.rs    # Tool call → ActionType mapping
```

### Testing Strategy
1. **Unit tests**: Each component in isolation with fakes
2. **Integration tests**: Transducer with real components
3. **Golden snapshot tests**: Replay `.jsonl` fixtures and compare output

### Future Enhancements
1. Implement `CorrIdResolver` for production use (scan MsgStore entries)
2. Add property-based tests for reducer invariants
3. Create replay CLI for manual QA with `.jsonl` fixtures
4. Add SQLite queries for inspecting processed conversations by task ID

## References
- Oracle architectural review (2025-10-20)
- Original implementation in `crates/executors/src/executors/droid/`
