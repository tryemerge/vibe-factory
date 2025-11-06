# Factory Floor Assembly Line Roadmap

**Vision:** Tasks flow through specialized agents in predefined workflows, like products on an assembly line.

**Current State:** ✅ Dynamic agent personas with custom prompts and context (PR #8 merged)

**Target State:** 🎯 Multi-agent workflows with automatic station transitions and visual workflow builder

---

## Phase Breakdown

### ✅ Phase 0: Foundation (COMPLETE)
**PR #8 - Factory Floor Agents**
- [x] Agent database schema (name, role, system_prompt, executor, context_files)
- [x] Agent CRUD API
- [x] Agent management UI (`/agents` page)
- [x] Agent selector in tasks (default + runtime switching)
- [x] Backend integration (agent prompts applied to follow-ups)

**What You Can Do Now:**
- Create specialized agent personas
- Switch agents during task conversations
- Configure custom prompts and context files per agent

---

## Phase 1: Workflow Database Foundation
**Goal:** Store workflow definitions (assembly lines) in the database

**Estimated Time:** 3-4 hours

### Tasks:

#### Task 1.1: Create Workflow Tables Migration
**File:** `crates/db/migrations/20251102000000_workflow_tables.sql`

```sql
-- Workflows define the assembly line
CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, name)
);

-- Stations are processing nodes in a workflow
CREATE TABLE workflow_stations (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    description TEXT,
    x_position REAL NOT NULL DEFAULT 0,
    y_position REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Station steps define the agent sequence within a station
CREATE TABLE station_steps (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    position INTEGER NOT NULL,
    step_prompt TEXT,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Transitions define flow between stations
CREATE TABLE station_transitions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    source_station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    target_station_id TEXT NOT NULL REFERENCES workflow_stations(id) ON DELETE CASCADE,
    condition TEXT,
    label TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Link tasks to workflows
ALTER TABLE tasks ADD COLUMN workflow_id TEXT REFERENCES workflows(id);
ALTER TABLE tasks ADD COLUMN current_station_id TEXT REFERENCES workflow_stations(id);

-- Track station execution
CREATE TABLE task_station_executions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    station_id TEXT NOT NULL REFERENCES workflow_stations(id),
    status TEXT NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_workflows_project_id ON workflows(project_id);
CREATE INDEX idx_workflow_stations_workflow_id ON workflow_stations(workflow_id);
CREATE INDEX idx_station_steps_station_id ON station_steps(station_id);
CREATE INDEX idx_station_transitions_workflow_id ON station_transitions(workflow_id);
CREATE INDEX idx_tasks_workflow_id ON tasks(workflow_id);
CREATE INDEX idx_task_station_executions_task_id ON task_station_executions(task_id);
```

**Acceptance Criteria:**
- Migration runs without errors
- All foreign keys enforced
- Indexes created for performance

---

#### Task 1.2: Create Workflow Rust Models
**Files:**
- `crates/db/src/models/workflow.rs`
- `crates/db/src/models/workflow_station.rs`
- `crates/db/src/models/station_step.rs`
- `crates/db/src/models/station_transition.rs`
- `crates/db/src/models/task_station_execution.rs`

**Example Structure:**
```rust
// crates/db/src/models/workflow.rs
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use ts_rs::TS;
use uuid::Uuid;

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

impl Workflow {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> { /* ... */ }
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> { /* ... */ }
    pub async fn find_by_project(pool: &SqlitePool, project_id: Uuid) -> Result<Vec<Self>, sqlx::Error> { /* ... */ }
    pub async fn create(pool: &SqlitePool, data: CreateWorkflow) -> Result<Self, sqlx::Error> { /* ... */ }
    pub async fn update(pool: &SqlitePool, id: Uuid, data: UpdateWorkflow) -> Result<Self, sqlx::Error> { /* ... */ }
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> { /* ... */ }
}
```

**Acceptance Criteria:**
- All models implement CRUD operations
- TypeScript types generated via ts-rs
- All fields properly typed (Uuid, DateTime, etc.)
- Follows existing model patterns

---

#### Task 1.3: Update Task Model
**File:** `crates/db/src/models/task.rs`

**Changes:**
- Add `workflow_id: Option<Uuid>` field
- Add `current_station_id: Option<Uuid>` field
- Update `CreateTask` and `UpdateTask` structs
- Update all SQL queries to include new fields

**Acceptance Criteria:**
- Existing tasks work with null workflow_id
- TypeScript types updated
- SQLx query cache updated

---

## Phase 2: Workflow CRUD APIs
**Goal:** REST endpoints to manage workflows, stations, steps, transitions

**Estimated Time:** 4-5 hours

### Tasks:

#### Task 2.1: Workflow API Routes
**File:** `crates/server/src/routes/workflows.rs`

**Endpoints:**
- `GET /api/workflows` - List all workflows (with project filter)
- `POST /api/workflows` - Create workflow
- `GET /api/workflows/:id` - Get workflow details
- `PUT /api/workflows/:id` - Update workflow
- `DELETE /api/workflows/:id` - Delete workflow
- `GET /api/workflows/:id/full` - Get workflow with stations, steps, transitions

**Acceptance Criteria:**
- All CRUD operations work
- Proper error handling
- Returns TypeScript-compatible JSON

---

#### Task 2.2: Workflow Station API Routes
**File:** `crates/server/src/routes/workflow_stations.rs`

**Endpoints:**
- `GET /api/workflows/:workflow_id/stations` - List stations in workflow
- `POST /api/workflows/:workflow_id/stations` - Create station
- `PUT /api/stations/:id` - Update station (position, name, coordinates)
- `DELETE /api/stations/:id` - Delete station

**Acceptance Criteria:**
- Stations ordered by position
- x_position, y_position stored for visual builder
- Cascading deletes handled

---

#### Task 2.3: Station Steps API Routes
**File:** `crates/server/src/routes/station_steps.rs`

**Endpoints:**
- `GET /api/stations/:station_id/steps` - List steps in station
- `POST /api/stations/:station_id/steps` - Add step (agent assignment)
- `PUT /api/steps/:id` - Update step
- `DELETE /api/steps/:id` - Remove step

**Acceptance Criteria:**
- Steps ordered by position
- Agent validation (agent must exist)
- Returns agent details with step

---

#### Task 2.4: Station Transitions API Routes
**File:** `crates/server/src/routes/station_transitions.rs`

**Endpoints:**
- `GET /api/workflows/:workflow_id/transitions` - List transitions
- `POST /api/workflows/:workflow_id/transitions` - Create transition
- `DELETE /api/transitions/:id` - Delete transition

**Acceptance Criteria:**
- Validates source/target stations exist
- Prevents invalid transitions (cycles, self-loops)

---

#### Task 2.5: Update Task API
**File:** `crates/server/src/routes/tasks.rs`

**Changes:**
- Add `workflow_id` to task creation
- Add `current_station_id` to task updates
- Add endpoint: `POST /api/tasks/:id/advance-station` - Move to next station

**Acceptance Criteria:**
- Tasks can be assigned to workflows
- Station advancement updates current_station_id

---

## Phase 3: Frontend Workflow CRUD UI
**Goal:** Web UI to create and manage workflows

**Estimated Time:** 6-8 hours

### Tasks:

#### Task 3.1: Workflows Page
**File:** `frontend/src/pages/workflows.tsx`

**Features:**
- List all workflows (grouped by project)
- Create new workflow button
- Edit/delete workflow actions
- Empty state with helpful guidance

**UI:**
```
┌─────────────────────────────────────────┐
│ Workflows                    [+ Create] │
├─────────────────────────────────────────┤
│ Project: vibe-factory                   │
│   📋 Feature Development Workflow       │
│      4 stations • 2 tasks in progress   │
│      [Edit] [Delete]                    │
│                                         │
│   📋 Bug Fix Workflow                   │
│      2 stations • 0 tasks               │
│      [Edit] [Delete]                    │
└─────────────────────────────────────────┘
```

**Acceptance Criteria:**
- Displays all workflows
- Shows station count per workflow
- Clicking workflow opens visual editor

---

#### Task 3.2: Workflow Form Dialog
**File:** `frontend/src/components/dialogs/workflows/WorkflowFormDialog.tsx`

**Features:**
- Name and description fields
- Project selector
- Create/update workflow

**Acceptance Criteria:**
- Validation (name required, unique per project)
- Success feedback
- Refreshes workflow list on save

---

#### Task 3.3: Add Workflow Selector to Task Form
**File:** `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`

**Changes:**
- Add workflow dropdown (optional)
- Shows workflows for selected project
- Displays "No workflow (manual execution)" option

**Acceptance Criteria:**
- Task can be assigned to workflow on creation
- Workflow can be changed on edit
- null workflow = normal task behavior

---

## Phase 4: Visual Workflow Builder (React Flow)
**Goal:** Drag-and-drop workflow designer

**Estimated Time:** 10-12 hours

### Tasks:

#### Task 4.1: Install React Flow
```bash
cd frontend
pnpm add reactflow
```

---

#### Task 4.2: Workflow Visual Builder Page
**File:** `frontend/src/pages/workflow-builder.tsx`

**Features:**
- React Flow canvas
- Drag-to-add stations from sidebar
- Connect stations with edges (transitions)
- Click station to edit steps
- Save workflow layout (x/y positions)

**UI Layout:**
```
┌──────────────┬─────────────────────────────────────┐
│ Stations     │ Canvas                              │
│              │                                     │
│ [+ Station]  │   ┌─────────┐      ┌─────────┐    │
│              │   │ Design  │  →→  │ Coding  │    │
│ 📍 Design    │   │ Station │      │ Station │    │
│ 📍 Coding    │   └─────────┘      └─────────┘    │
│ 📍 Testing   │         ↓                          │
│ 📍 Review    │   ┌─────────┐      ┌─────────┐    │
│              │   │ Testing │  →→  │ Review  │    │
│              │   │ Station │      │ Station │    │
│              │   └─────────┘      └─────────┘    │
│              │                                     │
│              │ [Controls] [MiniMap] [Background]  │
└──────────────┴─────────────────────────────────────┘
```

**Acceptance Criteria:**
- Stations can be added/removed
- Transitions created by connecting nodes
- Layout saved to database (x_position, y_position)
- Zooming and panning work

---

#### Task 4.3: Station Node Component
**File:** `frontend/src/components/workflow/StationNode.tsx`

**Features:**
- Custom React Flow node
- Shows station name
- Displays agent count badge
- Edit/delete buttons
- Connection handles (input/output)

**Acceptance Criteria:**
- Styled to match vibe-factory design
- Click to open station editor
- Shows visual feedback for current station (if task is at this station)

---

#### Task 4.4: Station Editor Dialog
**File:** `frontend/src/components/dialogs/workflows/StationEditorDialog.tsx`

**Features:**
- Station name and description
- List of steps (ordered)
- Add step: select agent, optional step prompt
- Reorder steps (drag to reorder)
- Delete step

**UI:**
```
┌─────────────────────────────────────────┐
│ Station: Design                  [Save] │
├─────────────────────────────────────────┤
│ Name: [Design Station          ]        │
│ Description: [Initial planning  ]       │
│                                         │
│ Steps (executed in order):              │
│   1. Requirements Agent                 │
│      "Analyze requirements"             │
│      [↑] [↓] [Edit] [Delete]           │
│                                         │
│   2. Architecture Agent                 │
│      "Design system architecture"       │
│      [↑] [↓] [Edit] [Delete]           │
│                                         │
│   [+ Add Step]                          │
└─────────────────────────────────────────┘
```

**Acceptance Criteria:**
- Steps displayed in order
- Can add/remove/reorder steps
- Agent selector for each step
- Optional step-specific prompt

---

## Phase 5: Workflow Orchestration Engine
**Goal:** Automatically execute agents in workflow order

**Estimated Time:** 8-10 hours

### Tasks:

#### Task 5.1: Workflow Orchestrator Service
**File:** `crates/services/src/workflow_orchestrator.rs`

**Features:**
- Load workflow for task
- Execute stations in sequence
- For each station, execute agent steps in order
- Track execution status in `task_station_executions`
- Emit SSE events for UI updates

**Core Logic:**
```rust
pub struct WorkflowOrchestrator {
    pool: SqlitePool,
    deployment: DeploymentImpl,
}

impl WorkflowOrchestrator {
    pub async fn start_workflow_execution(&self, task_id: Uuid) -> Result<(), WorkflowError> {
        let task = Task::find_by_id(&self.pool, task_id).await?;
        let workflow_id = task.workflow_id.ok_or(WorkflowError::NoWorkflow)?;

        let workflow = Workflow::find_by_id(&self.pool, workflow_id).await?;
        let stations = WorkflowStation::find_by_workflow(&self.pool, workflow_id).await?;

        // Execute stations in position order
        for station in stations.iter().sorted_by_key(|s| s.position) {
            self.execute_station(&task, station).await?;
        }

        Ok(())
    }

    async fn execute_station(&self, task: &Task, station: &WorkflowStation) -> Result<(), WorkflowError> {
        // Update task current_station_id
        Task::update(&self.pool, task.id, UpdateTask {
            current_station_id: Some(station.id),
            ..Default::default()
        }).await?;

        // Load steps
        let steps = StationStep::find_by_station(&self.pool, station.id).await?;

        // Execute each step (agent) in sequence
        for step in steps.iter().sorted_by_key(|s| s.position) {
            self.execute_step(task, station, step).await?;
        }

        Ok(())
    }

    async fn execute_step(&self, task: &Task, station: &WorkflowStation, step: &StationStep) -> Result<(), WorkflowError> {
        // Track execution start
        let execution = TaskStationExecution::create(&self.pool, CreateTaskStationExecution {
            task_id: task.id,
            station_id: station.id,
            status: "running".into(),
            ..Default::default()
        }).await?;

        // Load agent
        let agent = Agent::find_by_id(&self.pool, step.agent_id).await?;

        // Build prompt (combine agent prompt + step prompt + task context)
        let prompt = self.build_agent_prompt(&agent, step, task).await?;

        // Execute via existing task attempt infrastructure
        // This creates a follow-up with the agent's configuration
        let follow_up = self.deployment.execute_follow_up(ExecuteFollowUpRequest {
            task_attempt_id: task.current_attempt_id,
            agent_id: Some(agent.id),
            prompt,
            ..Default::default()
        }).await?;

        // Wait for completion (poll execution process)
        self.wait_for_completion(follow_up.process_id).await?;

        // Mark execution complete
        TaskStationExecution::update(&self.pool, execution.id, UpdateTaskStationExecution {
            status: Some("completed".into()),
            completed_at: Some(Utc::now()),
            ..Default::default()
        }).await?;

        Ok(())
    }
}
```

**Acceptance Criteria:**
- Workflow executes stations in order
- Each station executes all steps sequentially
- Execution tracking in database
- SSE events emitted for UI updates
- Error handling and recovery

---

#### Task 5.2: Workflow Start Endpoint
**File:** `crates/server/src/routes/tasks.rs`

**New Endpoint:**
- `POST /api/tasks/:id/start-workflow` - Begin workflow execution

**Behavior:**
- Validates task has workflow_id
- Starts orchestrator
- Returns immediately (async execution)
- Client listens to SSE for progress

**Acceptance Criteria:**
- Endpoint returns success immediately
- Workflow orchestration runs in background
- UI can track progress via SSE

---

#### Task 5.3: Workflow Execution UI
**File:** `frontend/src/components/workflow/WorkflowExecutionPanel.tsx`

**Features:**
- Shows current station
- Lists completed stations (checkmarks)
- Lists upcoming stations (grayed out)
- Real-time progress from SSE
- Logs from current agent execution

**UI:**
```
┌─────────────────────────────────────────┐
│ Workflow Progress                       │
├─────────────────────────────────────────┤
│ ✅ Design Station (completed)           │
│    └─ Requirements Agent ✅             │
│    └─ Architecture Agent ✅             │
│                                         │
│ ▶️  Coding Station (in progress)        │
│    └─ Backend Agent 🔄 running...      │
│    └─ Frontend Agent ⏳ pending        │
│                                         │
│ ⏳ Testing Station (pending)            │
│    └─ Test Agent ⏳ pending             │
│                                         │
│ ⏳ Review Station (pending)             │
│    └─ Review Agent ⏳ pending           │
└─────────────────────────────────────────┘
```

**Acceptance Criteria:**
- Updates in real-time via SSE
- Shows which station is active
- Shows which agent is executing
- Can click to view logs

---

## Phase 6: Integration & Polish
**Goal:** Seamless experience from workflow creation to execution

**Estimated Time:** 4-6 hours

### Tasks:

#### Task 6.1: Project Configuration for Workflows
**File:** `frontend/src/components/dialogs/projects/ProjectFormDialog.tsx`

**Feature:**
- Add "Default Workflow" dropdown to project form
- Projects can have a default workflow for all new tasks

**Acceptance Criteria:**
- Project default workflow applied to new tasks
- Can be overridden per task

---

#### Task 6.2: Workflow Template Library
**File:** `frontend/src/components/workflows/WorkflowTemplates.tsx`

**Features:**
- Pre-built workflow templates
  - "Feature Development" (Design → Code → Test → Review)
  - "Bug Fix" (Analyze → Fix → Test)
  - "Refactoring" (Audit → Refactor → Test → Review)
- One-click template instantiation

**Acceptance Criteria:**
- Templates create complete workflows with stations and steps
- User can customize after creation

---

#### Task 6.3: Workflow Analytics
**File:** `frontend/src/components/workflows/WorkflowAnalytics.tsx`

**Features:**
- Show workflow execution metrics
  - Average time per station
  - Success rate per station
  - Bottleneck identification
- Display on workflow detail page

**Acceptance Criteria:**
- Calculates metrics from task_station_executions
- Visual charts (bar graphs, etc.)

---

#### Task 6.4: Manual Station Override
**Feature:** Allow manual intervention in workflow execution

**Endpoints:**
- `POST /api/tasks/:id/skip-station` - Skip current station, move to next
- `POST /api/tasks/:id/retry-station` - Retry failed station

**Acceptance Criteria:**
- User can manually advance/retry
- Workflow continues from override point

---

## Summary: Complete Task List

Here are **all the tasks** you need to implement the full factory floor assembly line:

### Database & Models (Phase 1)
1. ✅ Create workflow tables migration
2. ✅ Create Workflow Rust model
3. ✅ Create WorkflowStation Rust model
4. ✅ Create StationStep Rust model
5. ✅ Create StationTransition Rust model
6. ✅ Create TaskStationExecution Rust model
7. ✅ Update Task model with workflow fields

### Backend APIs (Phase 2)
8. ✅ Workflow CRUD API routes
9. ✅ Workflow Station API routes
10. ✅ Station Steps API routes
11. ✅ Station Transitions API routes
12. ✅ Update Task API with workflow support

### Frontend UI (Phase 3)
13. ✅ Workflows list page
14. ✅ Workflow form dialog
15. ✅ Add workflow selector to task form

### Visual Builder (Phase 4)
16. ✅ Install React Flow
17. ✅ Workflow visual builder page (canvas)
18. ✅ Station node component
19. ✅ Station editor dialog

### Orchestration (Phase 5)
20. ✅ Workflow orchestrator service
21. ✅ Workflow start endpoint
22. ✅ Workflow execution UI panel

### Polish (Phase 6)
23. ✅ Project default workflow configuration
24. ✅ Workflow template library
25. ✅ Workflow analytics dashboard
26. ✅ Manual station override controls

---

## Recommended Implementation Order

**Week 1: Foundation**
- Tasks 1-7 (Database & Models)
- Tasks 8-12 (Backend APIs)

**Week 2: Basic UI**
- Tasks 13-15 (Workflow CRUD UI)
- Tasks 16-19 (Visual Builder)

**Week 3: Execution**
- Tasks 20-22 (Orchestration Engine)

**Week 4: Polish**
- Tasks 23-26 (Integration & Features)

---

## Success Metrics

You'll know it's working when:
1. ✅ Can create a workflow with multiple stations visually
2. ✅ Can assign agents to each station in sequence
3. ✅ Create task assigned to workflow
4. ✅ Click "Start Workflow"
5. ✅ Watch agents execute automatically in order
6. ✅ See task progress through stations in real-time
7. ✅ Task completes after all stations finish

**The assembly line is running!** 🏭
