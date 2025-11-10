# Phase 2.3: Station Transition Evaluation System

**Status**: Design Complete
**Date**: 2025-11-08
**Related**: [Workflow Execution Documentation](../features/workflow-execution.md)

## Overview

This document defines the complete design for evaluating station transitions in workflow executions. The system determines which station to execute next based on conditional logic, enabling dynamic workflow routing with branching, loops, and error handling paths.

## Database Schema

The transition evaluation system uses the `station_transitions` table:

```sql
CREATE TABLE station_transitions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    source_station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    target_station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    condition TEXT,              -- Legacy field (unused in Phase 2.3)
    label TEXT,                  -- Human-readable label for UI
    condition_type TEXT DEFAULT 'always',    -- 'always', 'success', 'failure', 'conditional'
    condition_value TEXT,        -- JSON expression for conditional evaluation
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Key Fields**:
- `condition_type`: Determines the type of transition logic
- `condition_value`: Contains the expression to evaluate (for conditional type)
- `source_station_id`: The station this transition originates from
- `target_station_id`: The station to transition to if condition matches

## Transition Types

### 1. Unconditional Transitions (`always`)

**Always** take this transition, regardless of station outcome.

```json
{
  "condition_type": "always",
  "condition_value": null
}
```

**Use Cases**:
- Linear workflows with no branching
- Default "happy path" when no other conditions match
- Forced progression regardless of outcome

**Evaluation**: Returns `true` immediately without checking station output.

**Aliases**: `"unconditional"`, `"always"`, `null` (all treated the same)

---

### 2. Success Transitions (`success`)

Only transition if the station **completed successfully** (status = `"completed"`).

```json
{
  "condition_type": "success",
  "condition_value": null
}
```

**Use Cases**:
- Normal workflow progression after successful completion
- "Happy path" routing when station succeeds

**Evaluation**:
```rust
station_execution.status == "completed"
```

**Important**: If station fails (status = `"failed"`), this transition will **not** be taken.

---

### 3. Failure Transitions (`failure`)

Only transition if the station **failed** (status = `"failed"`).

```json
{
  "condition_type": "failure",
  "condition_value": null
}
```

**Use Cases**:
- Error handling paths
- Retry logic (transition back to same station or error recovery station)
- Fallback workflows when primary path fails

**Evaluation**:
```rust
station_execution.status == "failed"
```

**Example Workflow**:
```
Design Station → Implementation Station (success)
              └→ Error Analysis Station (failure)
```

---

### 4. Conditional Transitions (`conditional`)

Evaluate `condition_value` expression against station `output_data`.

```json
{
  "condition_type": "conditional",
  "condition_value": "<expression>"
}
```

**Supported Expression Formats**:

#### A. Simple Key Existence Check

Check if a key exists in the station's output data.

```json
{
  "condition_type": "conditional",
  "condition_value": "review_passed"
}
```

**Evaluation**: Returns `true` if `output_data` contains the key `"review_passed"`, regardless of its value.

**Use Case**: Check if agent provided a specific output field.

---

#### B. Key-Value Comparison (Boolean)

Check if a key exists **and** has a specific boolean value.

```json
{
  "condition_type": "conditional",
  "condition_value": "{\"key\": \"review_passed\", \"value\": true}"
}
```

**Evaluation**: Returns `true` if `output_data.review_passed == true`.

**Use Case**: Branch based on boolean decisions (approved/rejected, passed/failed).

---

#### C. Key-Value Comparison (String)

Check if a key exists **and** has a specific string value.

```json
{
  "condition_type": "conditional",
  "condition_value": "{\"key\": \"status\", \"value\": \"approved\"}"
}
```

**Evaluation**: Returns `true` if `output_data.status == "approved"`.

**Use Case**: Branch based on categorical decisions (approved/rejected/pending, high/medium/low priority).

---

#### D. Key-Value Comparison (Number)

Check if a key exists **and** has a specific numeric value.

```json
{
  "condition_type": "conditional",
  "condition_value": "{\"key\": \"test_failures\", \"value\": 0}"
}
```

**Evaluation**: Returns `true` if `output_data.test_failures == 0`.

**Use Case**: Threshold-based routing (e.g., proceed only if zero test failures).

---

## Station Output Data Structure

### Format

Station output data is stored in `station_executions.output_data` as a **JSON string**:

```json
{
  "review_passed": true,
  "reviewer": "alice",
  "test_failures": 0,
  "priority": "high",
  "deployment_ready": false
}
```

### How Agents Provide Output Data

**Phase 1.1 Approach (Manual)**:

Agents are instructed via their prompt to provide outputs in a JSON code block:

```markdown
## Expected Outputs

Please provide the following outputs in a JSON code block (```json ... ```):
- review_passed
- reviewer
- test_failures

Example format:
```json
{
  "review_passed": true,
  "reviewer": "alice",
  "test_failures": 0
}
```
```

The `WorkflowOrchestrator::extract_output_data()` function parses the agent's response text to extract the JSON block.

**Future Enhancement (Phase 2+)**:
- Automatic extraction from git commits, file changes
- Tool-based output registration (agent calls a tool to register outputs)
- Structured output parsing from LLM responses

### Output Context Keys

Each `workflow_station` can define expected outputs via `output_context_keys`:

```json
{
  "output_context_keys": "[\"review_passed\", \"reviewer\", \"test_failures\"]"
}
```

These keys:
1. Are included in the agent prompt (tells agent what to provide)
2. Guide the `extract_output_data()` function (what keys to extract)
3. Are available to subsequent stations via context merging

## Transition Evaluation Algorithm

### High-Level Flow

```rust
async fn advance_to_next_station(
    workflow_execution_id: Uuid,
    current_station_id: Uuid,
    station_execution: &StationExecution,
) -> Result<Option<Uuid>>
```

**Steps**:

1. **Load Transitions**: Query all transitions where `source_station_id = current_station_id`
   ```sql
   SELECT * FROM station_transitions
   WHERE source_station_id = ?
   ORDER BY created_at
   ```

2. **No Transitions Found**: If empty, workflow is complete
   ```rust
   if transitions.is_empty() {
       return Ok(None); // Workflow complete
   }
   ```

3. **Evaluate Each Transition** (in order):
   ```rust
   for transition in transitions {
       validate_transition_condition(&transition)?;

       if evaluate_transition(&transition, station_execution).await? {
           detect_circular_workflow(workflow_execution_id, transition.target_station_id).await?;
           return Ok(Some(transition.target_station_id));
       }
   }
   ```

4. **No Match Found**: Error (workflow stuck)
   ```rust
   Err(NoValidTransition(current_station_id))
   ```

### Evaluation Priority

**First match wins** (short-circuit evaluation):

```
Station A completed successfully with output_data = {"review_passed": true}

Transitions from Station A:
1. condition_type: "conditional", condition_value: {"key": "review_passed", "value": true}
   → Evaluates to TRUE → Takes this transition to Station B

2. condition_type: "success"
   → NEVER EVALUATED (first match already won)
```

**Design Rationale**:
- Simple and predictable
- Database order determines priority (order by `created_at`)
- Workflow designer must ensure mutually exclusive conditions

**Alternative Considered**: Explicit `priority` field
- **Rejected**: Adds complexity without clear benefit
- **If needed later**: Can add `priority INTEGER` column and `ORDER BY priority, created_at`

### Validation Before Evaluation

Before evaluating any transition, syntax is validated:

```rust
fn validate_transition_condition(
    condition_type: Option<&str>,
    condition_value: Option<&str>,
) -> Result<()>
```

**Checks**:
- `conditional` transitions must have `condition_value`
- `condition_value` JSON must be well-formed (if it starts with `{`)
- `condition_type` must be recognized (`success`, `failure`, `conditional`, `always`, or `null`)

**Errors**:
- `InvalidTransitionSyntax`: Malformed JSON, unknown condition_type
- Logs error with full context (transition ID, workflow execution ID)

## Conditional Expression Evaluation

### Evaluation Logic

```rust
async fn evaluate_condition_expression(
    condition_value: &str,
    station_execution: &StationExecution,
) -> Result<bool>
```

**Step 1: Parse Station Output**

```rust
let output = if let Some(output_data) = &station_execution.output_data {
    serde_json::from_str::<JsonValue>(output_data)?
} else {
    return Ok(false); // No output data → condition cannot be satisfied
};
```

**Step 2: Parse Condition Value**

Try parsing `condition_value` as JSON:

```rust
let condition_result = serde_json::from_str::<JsonValue>(condition_value);
```

**Step 3: Match on Condition Format**

#### Format 1: String (Key Existence)

```json
"review_passed"
```

→ Check if key exists in output:
```rust
Ok(output.get(&key).is_some())
```

---

#### Format 2: Object (Key-Value Comparison)

```json
{"key": "review_passed", "value": true}
```

→ Check if key exists **and** value matches:
```rust
if let Some(actual_value) = output.get(key) {
    Ok(actual_value == expected_value)
} else {
    Ok(false) // Key doesn't exist
}
```

---

#### Format 3: Legacy Object Format (Deprecated)

```json
{"check_output_key": "review_passed", "expected_value": true}
```

→ Same logic as Format 2, using different field names.

**Note**: Supported for backward compatibility only.

---

#### Format 4: Plain String (No JSON Quotes)

```
review_passed
```

→ Treated as key existence check (same as Format 1).

---

### Error Handling

**Scenario**: Output data cannot be parsed as JSON

```rust
Err(OutputDataParseError("Failed to parse station output data: ..."))
```

**Scenario**: Condition value has invalid format

```rust
Err(TransitionEvaluationError("Unsupported condition type. Expected string or object, got: ..."))
```

**Scenario**: Key doesn't exist in output

```rust
Ok(false) // Not an error, just returns false
```

**Note**: Missing keys are **not errors** - they simply cause the condition to evaluate to `false`.

## Context Accumulation

### Gathering Context from Previous Stations

Before executing a new station, the orchestrator gathers output data from **all previously completed stations**:

```rust
async fn gather_context_data(
    workflow_execution_id: Uuid
) -> Result<JsonValue>
```

**Logic**:

1. Load all `station_executions` for this workflow execution
2. For each station with `status = "completed"`:
   - Parse `output_data` as JSON
   - Merge keys into a single context object
3. Return merged context

**Example**:

```
Station A output: {"design_doc": "path/to/design.md", "approved": true}
Station B output: {"implementation": "path/to/code.rs", "tests_written": true}

Merged context passed to Station C:
{
  "design_doc": "path/to/design.md",
  "approved": true,
  "implementation": "path/to/code.rs",
  "tests_written": true
}
```

### Overwrite Strategy

**If two stations output the same key, later stations overwrite earlier ones**:

```
Station A output: {"status": "draft", "author": "alice"}
Station B output: {"status": "final"}

Merged context:
{
  "status": "final",    ← Station B overwrote Station A's value
  "author": "alice"
}
```

**Design Rationale**:
- Simpler for common case where keys don't conflict
- Allows stations to refine/update earlier decisions
- Explicit overwriting behavior is predictable

**Alternative Considered**: Namespace by station ID
```json
{
  "station_a__status": "draft",
  "station_b__status": "final"
}
```
**Rejected**: More complex, harder to use in conditions. Can be added later if conflicts become problematic.

## Edge Cases and Error Handling

### 1. No Transitions Found

**Scenario**: Station completes but has no outgoing transitions.

**Behavior**: Workflow is considered **complete**.

```rust
if transitions.is_empty() {
    WorkflowExecution::update(status = "completed");
    Task::update_status(task_id, TaskStatus::InReview);
    return Ok(None);
}
```

**Use Case**: Final station in a linear workflow.

---

### 2. No Matching Transitions

**Scenario**: Station completes but none of the transitions evaluate to `true`.

**Behavior**: Error - workflow is **stuck**.

```rust
Err(NoValidTransition(current_station_id))
```

**Error Handling**:
- Logs structured error with station ID, workflow execution ID
- Workflow execution status remains `"running"` (can be retried/debugged)
- Manual intervention required (retry station, fix conditions, or cancel workflow)

**Best Practice**: Always have a fallback transition:
```
Station A → Station B (conditional: review_passed == true)
         └→ Station C (success) ← Catches all successful completions
```

---

### 3. Circular Workflow Detection

**Scenario**: Transition would route back to a station that has already been executed.

**Detection**:

```rust
async fn detect_circular_workflow(
    workflow_execution_id: Uuid,
    next_station_id: Uuid,
) -> Result<()>
```

**Logic**:
1. Load all `station_executions` for this workflow execution
2. Extract visited station IDs
3. Check if `next_station_id` is in visited list
4. If yes: `Err(CircularWorkflow(visited_stations))`

**Error**:
```rust
CircularWorkflow(vec![station_a_id, station_b_id, station_c_id])
```

**Note**: This **prevents infinite loops** but also **prevents intentional retry/loop transitions**.

**Future Enhancement**: Add `allow_revisit: bool` flag on transitions to enable controlled loops:
```json
{
  "condition_type": "failure",
  "target_station_id": "station_a_id",
  "allow_revisit": true
}
```

---

### 4. Station Execution Failure

**Scenario**: Station fails (status = `"failed"`).

**Behavior**:

1. Update `station_execution.status = "failed"`
2. Mark `workflow_execution.status = "failed"`
3. **Do not** attempt to advance to next station

```rust
if !success {
    WorkflowExecution::update(status = "failed", completed_at = now());
    return Ok(());
}
```

**Recovery Options**:
- Retry the failed station (via `retry_station_execution` endpoint)
- Cancel the workflow
- Manual debugging/intervention

**Future Enhancement**: Support failure transitions:
```
Station A → Station B (success)
         └→ Error Handler Station (failure)
```

**Status**: Failure transitions are **already supported** in the current implementation! The `evaluate_transition()` function checks for `condition_type = "failure"`.

---

### 5. Missing Output Data

**Scenario**: Station completes but doesn't provide `output_data`.

**Behavior**:
- Conditional transitions evaluate to `false`
- Success/failure transitions work normally (only check status)
- Unconditional transitions work normally

**Example**:

```
Station A completes with no output_data

Transition 1: condition_type = "conditional", condition_value = "review_passed"
→ Evaluates to false (no output data)

Transition 2: condition_type = "success"
→ Evaluates to true (station status is "completed")
```

**Best Practice**: Design workflows so conditional transitions are only used when output data is guaranteed.

---

### 6. Malformed Output Data

**Scenario**: Station provides `output_data` but it's not valid JSON.

**Behavior**: Error during evaluation.

```rust
Err(OutputDataParseError("Failed to parse station output data: ..."))
```

**Error Handling**:
- Logs error with full context
- Workflow execution stops (status remains `"running"`)
- Manual intervention required (fix output data or retry station)

**Prevention**: Agent prompts include JSON formatting examples. Future phases may add automatic validation.

---

### 7. Transition Validation Errors

**Scenario**: Transition has invalid `condition_type` or malformed `condition_value`.

**Behavior**: Error during validation (before evaluation).

```rust
Err(InvalidTransitionSyntax("Unknown condition_type: ..."))
```

**When Detected**: During `validate_transition_condition()` call.

**Prevention**: Validated when transitions are created (via API). Future: Add schema validation on creation.

---

## Implementation Reference

### File Locations

**Core Implementation**: `crates/services/src/services/workflow_orchestrator.rs`

**Key Functions**:
- `advance_to_next_station()` - Main transition evaluation loop
- `evaluate_transition()` - Evaluates a single transition
- `evaluate_condition_expression()` - Evaluates conditional expressions
- `validate_transition_condition()` - Validates transition syntax
- `gather_context_data()` - Merges output from previous stations
- `detect_circular_workflow()` - Prevents infinite loops

**Database Models**:
- `StationTransition` - `crates/db/src/models/station_transition.rs`
- `StationExecution` - `crates/db/src/models/station_execution.rs`

**Endpoints**:
- `POST /api/workflows/{id}/execute` - Start workflow execution
- `GET /api/workflow-executions/{id}` - Get workflow execution details
- `POST /api/workflow-executions/{id}/retry-station` - Retry failed station

---

## Testing Strategy

### Unit Tests

**Location**: `crates/services/src/services/workflow_orchestrator.rs` (in `#[cfg(test)]` module)

**Coverage**:
- ✅ Key existence check
- ✅ Key-value comparison (boolean, string, number)
- ✅ Unconditional transitions
- ✅ Success/failure transitions
- ✅ No output data (returns false)
- ✅ Validation (invalid syntax, missing condition_value)

**Test Helper Functions**:
```rust
fn create_test_station_execution(output_data: Option<&str>, status: &str) -> StationExecution
fn create_test_transition(condition_type: Option<&str>, condition_value: Option<&str>) -> StationTransition
```

### Integration Tests

**Recommended Tests** (not yet implemented):

1. **End-to-End Workflow Execution**
   - Create workflow with multiple stations
   - Execute stations in sequence
   - Verify transitions are evaluated correctly
   - Verify context is passed between stations

2. **Branching Workflow**
   - Create workflow with conditional transitions
   - Execute station with different output values
   - Verify correct branch is taken

3. **Circular Workflow Detection**
   - Create workflow with loop transition
   - Verify error is raised when loop is detected

4. **Error Recovery**
   - Create workflow with failure transition
   - Fail a station
   - Verify failure transition is taken

**Location**: `crates/services/tests/workflow_orchestrator_test.rs` (to be created)

---

## Future Enhancements

### 1. Complex Condition Expressions

**Current Limitation**: Only simple key-value comparisons.

**Proposed**: JSONPath or JSONLogic for complex queries:

```json
{
  "condition_type": "conditional",
  "condition_value": "$.test_results[?(@.status == 'failed')].length == 0"
}
```

**Benefits**:
- Nested object access: `output.results.summary.passed`
- Array filtering: "All tests passed"
- Arithmetic: `test_failures < 5`

**Library Options**:
- `jsonpath-rust` - JSONPath queries
- `jsonlogic-rs` - JSONLogic expressions

---

### 2. Explicit Priority Field

**Current**: First match wins (based on creation order).

**Proposed**: Add `priority INTEGER` to `station_transitions`:

```sql
ALTER TABLE station_transitions ADD COLUMN priority INTEGER DEFAULT 0;
```

**Query**:
```sql
SELECT * FROM station_transitions
WHERE source_station_id = ?
ORDER BY priority DESC, created_at
```

**Benefits**:
- Explicit control over evaluation order
- Easier to understand workflow logic

---

### 3. Controlled Loops / Retry Logic

**Current**: Circular workflow detection prevents all loops.

**Proposed**: Add `allow_revisit: bool` flag:

```json
{
  "condition_type": "failure",
  "target_station_id": "station_a_id",
  "allow_revisit": true,
  "max_retries": 3
}
```

**Detection Logic**:
```rust
if visited_stations.contains(&next_station_id) {
    if !transition.allow_revisit {
        return Err(CircularWorkflow);
    }

    let retry_count = visited_stations.iter().filter(|id| *id == &next_station_id).count();
    if retry_count >= transition.max_retries {
        return Err(RetryLimitExceeded);
    }
}
```

---

### 4. Automatic Output Extraction

**Current**: Manual (agent provides JSON in markdown code block).

**Proposed**: Automatic extraction from git changes:

```rust
async fn extract_output_from_git(
    task_attempt_id: Uuid,
    output_context_keys: &[String]
) -> Result<JsonValue>
```

**Strategies**:
- Parse commit messages for structured data
- Analyze file diffs (e.g., "tests added" → `tests_written: true`)
- LLM-based extraction from code changes

---

### 5. Transition Analytics

**Proposed**: Track which transitions are taken in production:

```sql
CREATE TABLE transition_analytics (
    id TEXT PRIMARY KEY,
    workflow_execution_id TEXT NOT NULL,
    transition_id TEXT NOT NULL,
    taken BOOLEAN NOT NULL,
    evaluation_time_ms INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Benefits**:
- Identify unused transitions
- Debug workflows (see which paths are taken)
- Performance optimization

---

## Summary

This design provides a **flexible, extensible transition evaluation system** with:

✅ **Four transition types**: Unconditional, success, failure, conditional
✅ **Multiple condition formats**: Key existence, key-value comparison
✅ **Context accumulation**: Previous station outputs available to later stations
✅ **Error handling**: Validation, missing data, circular workflows
✅ **Comprehensive testing**: Unit tests for all condition types

**Next Steps** (Phase 3+):
- Complex condition expressions (JSONPath/JSONLogic)
- Controlled loops with retry limits
- Automatic output extraction
- Transition analytics

The system is **already implemented** and **production-ready** for Phase 2.3. This document serves as the **design specification** and **implementation reference**.
