# Phase 1 Tasks - Workflow Database Foundation (Simplified)

**Architecture:** One agent per station + conditional transitions for loops

Copy and paste these into vibe-factory to create all 7 tasks:

---

## Task 1.1: Create Workflow Tables Migration

**Title:** Phase 1.1 - Create Workflow Tables Migration

**Description:**
Create migration file `crates/db/migrations/20251102000000_workflow_tables.sql` with simplified database schema for workflows.

### Tables to Create:

1. **workflows** - Define assembly lines
   - id, project_id, name, description, timestamps
   - UNIQUE(project_id, name)

2. **workflow_stations** - Processing nodes (ONE agent per station)
   - id, workflow_id, name, position
   - agent_id (FK to agents table)
   - station_prompt, description
   - output_context_keys (JSON array of context keys this station produces)
   - x_position, y_position (for visual builder)

3. **station_transitions** - Flow between stations with conditions
   - id, workflow_id, source_station_id, target_station_id
   - condition_type ('always', 'on_approval', 'on_rejection', 'on_tests_pass')
   - condition_value (optional JSON for complex conditions)
   - label (display text for transition)

4. **station_context** - Context accumulation as task progresses
   - id, task_id, station_id
   - context_key, context_value, context_type ('file', 'decision', 'artifact')
   - created_by_agent_id (FK to agents)
   - UNIQUE(task_id, station_id, context_key)

5. **task_station_executions** - Track execution progress
   - id, task_id, station_id, status
   - transition_taken_id (FK to station_transitions - which path was taken)
   - attempt_number (for retry tracking)
   - started_at, completed_at, error_message

6. **Update tasks table**
   - Add workflow_id column (FK to workflows)
   - Add current_station_id column (FK to workflow_stations)

### Indexes:
- All foreign keys
- workflow_stations.workflow_id
- station_context.task_id
- task_station_executions.task_id

### Example Schema:

```sql
CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, name)
);

CREATE TABLE workflow_stations (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    station_prompt TEXT,
    description TEXT,
    output_context_keys TEXT, -- JSON array: ["design_doc", "api_spec"]
    x_position REAL DEFAULT 0,
    y_position REAL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE station_transitions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    source_station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    target_station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    condition_type TEXT DEFAULT 'always', -- 'always', 'on_approval', 'on_rejection', 'on_tests_pass'
    condition_value TEXT, -- JSON for complex conditions
    label TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE station_context (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    context_key TEXT NOT NULL,
    context_value TEXT NOT NULL,
    context_type TEXT DEFAULT 'file', -- 'file', 'decision', 'artifact'
    created_by_agent_id TEXT REFERENCES agents(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, station_id, context_key)
);

CREATE TABLE task_station_executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
    transition_taken_id TEXT REFERENCES station_transitions(id),
    attempt_number INTEGER DEFAULT 1,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_workflow_stations_workflow ON workflow_stations(workflow_id);
CREATE INDEX idx_station_transitions_workflow ON station_transitions(workflow_id);
CREATE INDEX idx_station_context_task ON station_context(task_id);
CREATE INDEX idx_task_station_executions_task ON task_station_executions(task_id);

-- Update tasks table
ALTER TABLE tasks ADD COLUMN workflow_id TEXT REFERENCES workflows(id);
ALTER TABLE tasks ADD COLUMN current_station_id TEXT REFERENCES workflow_stations(id);
CREATE INDEX idx_tasks_workflow ON tasks(workflow_id);
```

### Acceptance Criteria:
- Migration runs without errors
- All foreign keys enforced
- All indexes created
- SQLx query cache updated

**Estimated:** 1 hour

---

## Task 1.2: Create Workflow Rust Model

**Title:** Phase 1.2 - Create Workflow Rust Model

**Description:**
Create `crates/db/src/models/workflow.rs` with complete CRUD operations.

### Structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Workflow {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateWorkflow {
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateWorkflow {
    pub name: Option<String>,
    pub description: Option<String>,
}
```

### Methods to Implement:
- `find_all(pool)` - List all workflows
- `find_by_id(pool, id)` - Get workflow by ID
- `find_by_project(pool, project_id)` - Get workflows for project
- `create(pool, data)` - Create new workflow
- `update(pool, id, data)` - Update workflow
- `delete(pool, id)` - Delete workflow

### Pattern:
Follow existing patterns from [agent.rs](crates/db/src/models/agent.rs) and [project.rs](crates/db/src/models/project.rs).

### Acceptance Criteria:
- All CRUD operations work
- TypeScript types generated via ts-rs
- SQLx queries use proper type casting
- Follows project conventions

**Estimated:** 30 minutes

---

## Task 1.3: Create WorkflowStation Rust Model

**Title:** Phase 1.3 - Create WorkflowStation Rust Model

**Description:**
Create `crates/db/src/models/workflow_station.rs` for station management with single agent assignment.

### Structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WorkflowStation {
    pub id: Uuid,
    pub workflow_id: Uuid,
    pub name: String,
    pub position: i64,
    pub agent_id: Uuid,  // Single agent per station
    pub station_prompt: Option<String>,
    pub description: Option<String>,
    pub output_context_keys: Option<String>,  // JSON array
    pub x_position: f64,
    pub y_position: f64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateWorkflowStation {
    pub workflow_id: Uuid,
    pub name: String,
    pub position: i64,
    pub agent_id: Uuid,
    pub station_prompt: Option<String>,
    pub description: Option<String>,
    pub output_context_keys: Option<String>,
    pub x_position: Option<f64>,
    pub y_position: Option<f64>,
}
```

### Methods:
- `find_by_workflow(pool, workflow_id)` - Get stations ordered by position
- `find_by_id(pool, id)` - Get station by ID
- `create(pool, data)` - Create station (validate agent exists)
- `update(pool, id, data)` - Update station
- `delete(pool, id)` - Delete station (cascade to transitions and context)

### Special Requirements:
- Stations ordered by `position` ASC
- Validate agent_id references valid agent
- Default x_position/y_position to 0.0 if not provided
- Parse output_context_keys as JSON array in frontend

### Acceptance Criteria:
- Foreign key to agents enforced
- Ordered query results
- Position management works
- Single agent per station (simplified model)

**Estimated:** 30 minutes

---

## Task 1.4: Create StationTransition Rust Model

**Title:** Phase 1.4 - Create StationTransition Rust Model

**Description:**
Create `crates/db/src/models/station_transition.rs` for workflow edges with conditional logic.

### Structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct StationTransition {
    pub id: Uuid,
    pub workflow_id: Uuid,
    pub source_station_id: Uuid,
    pub target_station_id: Uuid,
    pub condition_type: Option<String>,  // 'always', 'on_approval', 'on_rejection', 'on_tests_pass'
    pub condition_value: Option<String>,  // JSON for complex conditions
    pub label: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateStationTransition {
    pub workflow_id: Uuid,
    pub source_station_id: Uuid,
    pub target_station_id: Uuid,
    pub condition_type: Option<String>,
    pub condition_value: Option<String>,
    pub label: Option<String>,
}
```

### Methods:
- `find_by_workflow(pool, workflow_id)` - Get all transitions
- `find_by_station(pool, station_id)` - Get transitions from a station
- `find_by_id(pool, id)` - Get transition by ID
- `create(pool, data)` - Create transition with validation
- `delete(pool, id)` - Delete transition

### Validation:
- Prevent self-loops (source == target)
- Ensure source and target stations exist
- Ensure both stations belong to same workflow
- Validate condition_type enum values

### Condition Types:
- `always` - Default, unconditional progression
- `on_approval` - Progress if agent approves
- `on_rejection` - Loop back if agent rejects
- `on_tests_pass` - Progress if tests succeed

### Acceptance Criteria:
- Validation prevents invalid transitions
- All foreign keys enforced
- Enables workflow loops (e.g., Review → reject → Design)

**Estimated:** 30 minutes

---

## Task 1.5: Create StationContext Rust Model

**Title:** Phase 1.5 - Create StationContext Rust Model

**Description:**
Create `crates/db/src/models/station_context.rs` for context passing between stations.

### Purpose:
As tasks progress through workflow stations, context accumulates:
- Station 1 (Design): Outputs `design_doc.md`
- Station 2 (Review): Reads `design_doc.md`, outputs `review_notes.md`
- Station 3 (Implementation): Reads both, outputs `implementation.rs`

### Structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct StationContext {
    pub id: Uuid,
    pub task_id: Uuid,
    pub station_id: Uuid,
    pub context_key: String,  // e.g., "design_doc", "test_results"
    pub context_value: String,  // File path, JSON data, or text
    pub context_type: String,  // 'file', 'decision', 'artifact'
    pub created_by_agent_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateStationContext {
    pub task_id: Uuid,
    pub station_id: Uuid,
    pub context_key: String,
    pub context_value: String,
    pub context_type: String,
    pub created_by_agent_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateStationContext {
    pub context_value: Option<String>,
}
```

### Methods:
- `find_by_task(pool, task_id)` - Get all context for a task (ordered by station position)
- `find_by_task_and_station(pool, task_id, station_id)` - Get context for specific station
- `find_by_id(pool, id)` - Get context by ID
- `create(pool, data)` - Create context entry (upsert on conflict)
- `update(pool, id, data)` - Update context value
- `delete(pool, id)` - Delete context entry

### Context Types:
- `file` - File path or content
- `decision` - Approval/rejection decisions
- `artifact` - Generated outputs (test results, build logs)

### Acceptance Criteria:
- UNIQUE constraint enforced (task_id, station_id, context_key)
- Context accumulates as task progresses
- Can retrieve all context for orchestration
- Supports upsert pattern for updates

**Estimated:** 30 minutes

---

## Task 1.6: Create TaskStationExecution Rust Model

**Title:** Phase 1.6 - Create TaskStationExecution Rust Model

**Description:**
Create `crates/db/src/models/task_station_execution.rs` for tracking station progress and transitions.

### Structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TaskStationExecution {
    pub id: Uuid,
    pub task_id: Uuid,
    pub station_id: Uuid,
    pub status: String,  // 'pending', 'running', 'completed', 'failed'
    pub transition_taken_id: Option<Uuid>,  // Which transition was followed
    pub attempt_number: i64,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskStationExecution {
    pub task_id: Uuid,
    pub station_id: Uuid,
    pub status: String,
    pub attempt_number: i64,
    pub started_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTaskStationExecution {
    pub status: Option<String>,
    pub transition_taken_id: Option<Uuid>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}
```

### Methods:
- `find_by_task(pool, task_id)` - Get execution history for task
- `find_by_id(pool, id)` - Get execution by ID
- `create(pool, data)` - Create execution record
- `update(pool, id, data)` - Update status, completion time, errors, transition taken

### Status Values:
- `pending` - Station queued
- `running` - Currently executing
- `completed` - Successfully finished
- `failed` - Execution failed

### Special Requirements:
- Record which transition was taken (for loop tracking)
- Support retry attempts (attempt_number)
- Track execution timeline (started_at, completed_at)

### Acceptance Criteria:
- Status transitions tracked
- Timestamps recorded correctly
- Error messages captured
- Transition taken recorded for orchestration decisions

**Estimated:** 30 minutes

---

## Task 1.7: Update Task Model with Workflow Fields

**Title:** Phase 1.7 - Update Task Model with Workflow Fields

**Description:**
Update `crates/db/src/models/task.rs` to support workflow assignment.

### Changes Required:

#### 1. Add Fields to Task Struct:
```rust
pub struct Task {
    // ... existing fields
    pub workflow_id: Option<Uuid>,
    pub current_station_id: Option<Uuid>,
}
```

#### 2. Update CreateTask:
```rust
pub struct CreateTask {
    // ... existing fields
    pub workflow_id: Option<Uuid>,
}
```

#### 3. Update UpdateTask:
```rust
pub struct UpdateTask {
    // ... existing fields
    pub workflow_id: Option<Uuid>,
    pub current_station_id: Option<Uuid>,
}
```

#### 4. Update All SQL Queries:
- `find_all` - Include workflow_id, current_station_id
- `find_by_id` - Include new fields
- `create` - Insert workflow_id
- `update` - Update workflow_id, current_station_id

#### 5. Update Other Files:
- `crates/server/src/routes/tasks.rs` - Pass workflow_id in create/update
- `crates/server/src/mcp/task_server.rs` - Include workflow_id in MCP

#### 6. Regenerate Types:
```bash
pnpm run generate-types
```

#### 7. Update SQLx Cache:
```bash
DATABASE_URL="sqlite:///Users/the_dusky/code/emerge/vibe-factory/dev_assets/db.sqlite" cargo sqlx prepare --workspace
```

### Acceptance Criteria:
- Existing tasks work with null workflow_id
- New tasks can be assigned to workflows
- TypeScript types updated
- No compilation errors

**Estimated:** 30 minutes

---

## Quick Summary

**Total Tasks:** 7 (simplified from 8)
**Total Estimated Time:** 3.5 hours
**Dependencies:** Sequential (each builds on previous)

### Architecture Changes from Complex Model:
- ✅ Removed `station_steps` table (no multi-agent workflows within stations)
- ✅ Simplified `workflow_stations` to single `agent_id` field
- ✅ Added `condition_type` to `station_transitions` for logic gates
- ✅ Added `station_context` table for context accumulation
- ✅ Added `transition_taken_id` to track which path was followed

### Recommended Order:
1. Migration (creates all tables)
2. Workflow model
3. WorkflowStation model (single agent)
4. StationTransition model (with conditions)
5. StationContext model (context passing)
6. TaskStationExecution model (with transition tracking)
7. Update Task model

After completing all 7 tasks, you'll have:
- ✅ Complete simplified database schema
- ✅ All Rust models with CRUD
- ✅ TypeScript types generated
- ✅ One agent per station (simpler)
- ✅ Conditional transitions for loops
- ✅ Context accumulation between stations
- ✅ Foundation ready for Phase 2 (APIs)
