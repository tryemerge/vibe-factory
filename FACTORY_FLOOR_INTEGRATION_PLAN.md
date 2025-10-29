# Factory Floor Integration Plan

## Overview
This document outlines the plan to integrate **Factory Floor** functionality into vibe-kanban as a **web-based feature**. We are adapting concepts from emerge-code-factory (which uses Tauri desktop) into vibe-kanban's existing web architecture (Axum HTTP server + React frontend).

The factory floor feature adds:

- **Multi-agent configuration** - Define reusable agents with system prompts and capabilities
- **Visual workflows** - ReactFlow-based workflow designer with stations and transitions
- **Linear agent sequences** - Define multi-step agent execution within each station
- **Factory floor UI** - Real-time monitoring of workflow execution in the browser

## Architecture: Web-Based Implementation

**IMPORTANT**: This is a **web application** feature, NOT a desktop app. We are building on vibe-kanban's existing web architecture.

### What We're Building
- **Backend**: Axum HTTP server with REST API endpoints and SSE for real-time updates
- **Frontend**: React + TypeScript web UI in the browser
- **Communication**: HTTP requests + Server-Sent Events (no Tauri IPC, no desktop app)
- **Deployment**: Runs as part of vibe-kanban's existing `pnpm run dev` workflow

### Adapting emerge-code-factory Concepts to Web
| emerge-code-factory (Desktop) | vibe-kanban (Web) | Integration Strategy |
|------------------------------|-------------------|---------------------|
| Tauri IPC commands | HTTP REST API endpoints | Create `/api/workflows/*`, `/api/agents/*` routes |
| Tauri events | Server-Sent Events (SSE) | Use existing SSE infrastructure (`/api/events/*`) |
| Direct process spawning | Executor pattern | Extend existing executor system (no change needed) |
| `TaskProcessor` state machine | Manual task execution | Add workflow orchestration service in Rust backend |
| Desktop window | Browser tab | Add new tab to existing web UI layout |
| Global agents (desktop DB) | Global agents (web DB) | Same SQLite schema, accessed via HTTP API |

## Database Schema

### New Tables

```sql
-- Global agent pool (reusable across all projects)
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    capabilities TEXT, -- JSON array
    tools TEXT, -- JSON array
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Workflows define the assembly line for a project
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
    step_prompt TEXT, -- Additional instructions for this step
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
    condition TEXT, -- Future: conditional logic (JSON)
    label TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Link tasks to workflows
ALTER TABLE tasks ADD COLUMN workflow_id TEXT REFERENCES workflows(id);
ALTER TABLE tasks ADD COLUMN current_station_id TEXT REFERENCES workflow_stations(id);

-- Track station step execution
CREATE TABLE task_step_executions (
    id TEXT PRIMARY KEY,
    task_attempt_id TEXT NOT NULL REFERENCES task_attempts(id) ON DELETE CASCADE,
    station_step_id TEXT NOT NULL REFERENCES station_steps(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Backend Implementation

### Phase 1: Database Models & Migrations

**Location**: `crates/db/`

1. Create migration file: `crates/db/migrations/XXX_factory_floor.sql`
2. Add Rust models in `crates/db/src/models/`:
   - `agent.rs` - Global agent CRUD
   - `workflow.rs` - Workflow CRUD
   - `workflow_station.rs` - Station CRUD with position management
   - `station_step.rs` - Step CRUD with agent assignment
   - `station_transition.rs` - Transition CRUD
   - `task_step_execution.rs` - Execution tracking

**Key Pattern**: Follow existing models like `task.rs` and `project.rs`:
```rust
// Example: crates/db/src/models/agent.rs
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Agent {
    pub id: Uuid,
    pub name: String,
    pub role: String,
    pub system_prompt: String,
    pub capabilities: Option<String>, // JSON
    pub tools: Option<String>, // JSON
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateAgent {
    pub name: String,
    pub role: String,
    pub system_prompt: String,
    pub capabilities: Option<Vec<String>>,
    pub tools: Option<Vec<String>>,
    pub description: Option<String>,
}

impl Agent {
    pub async fn create(pool: &SqlitePool, data: CreateAgent) -> Result<Self, sqlx::Error> {
        // Implementation
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        // Implementation
    }

    // ... other CRUD methods
}
```

### Phase 2: HTTP API Endpoints (Web-Based)

**Location**: `crates/server/src/routes/`

Create new HTTP route modules for web browser access:
- `agents.rs` - `/api/agents` endpoints (GET, POST, PUT, DELETE)
- `workflows.rs` - `/api/workflows` endpoints
- `workflow_stations.rs` - `/api/workflows/:id/stations` endpoints
- `station_steps.rs` - `/api/stations/:id/steps` endpoints

**Integration**: Add to `crates/server/src/routes/mod.rs`:
```rust
pub mod agents;
pub mod workflows;
pub mod workflow_stations;
pub mod station_steps;

pub fn routes() -> Router<AppState> {
    Router::new()
        // ... existing routes
        .merge(agents::routes())
        .merge(workflows::routes())
        .merge(workflow_stations::routes())
        .merge(station_steps::routes())
}
```

**Example endpoint pattern** (follow existing `projects.rs` and `tasks.rs`):
```rust
// crates/server/src/routes/agents.rs
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json, Router,
    routing::{get, post, put, delete},
};
use db::models::agent::{Agent, CreateAgent, UpdateAgent};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/agents", get(list_agents).post(create_agent))
        .route("/api/agents/:id", get(get_agent).put(update_agent).delete(delete_agent))
}

async fn list_agents(State(state): State<AppState>) -> Result<Json<Vec<Agent>>, StatusCode> {
    Agent::find_all(&state.pool)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ... other handlers
```

### Phase 3: Workflow Orchestration Service (Backend)

**Location**: `crates/services/src/workflow_orchestrator.rs`

Create a new Rust service that runs on the **Axum HTTP server** and:
1. Loads workflow definition from SQLite database
2. Executes stations in sequence using existing executors
3. For each station, executes assigned agent steps in order
4. Emits SSE events to browser for real-time UI updates
5. Handles errors and station transitions

**Pattern**: Similar to emerge's `task_processor.rs` but adapted for vibe-kanban's web-based executor system:

```rust
pub struct WorkflowOrchestrator {
    pool: SqlitePool,
    app_state: AppState,
}

impl WorkflowOrchestrator {
    pub async fn execute_workflow_for_task(
        &self,
        task_id: Uuid,
    ) -> Result<(), WorkflowError> {
        // 1. Load task and workflow
        let task = Task::find_by_id(&self.pool, task_id).await?;
        let workflow = Workflow::find_by_id(&self.pool, task.workflow_id).await?;

        // 2. Load stations in order
        let stations = WorkflowStation::find_by_workflow(&self.pool, workflow.id)
            .await?
            .sort_by(|a, b| a.position.cmp(&b.position));

        // 3. Execute each station
        for station in stations {
            self.execute_station(&task, &station).await?;
        }

        Ok(())
    }

    async fn execute_station(
        &self,
        task: &Task,
        station: &WorkflowStation,
    ) -> Result<(), WorkflowError> {
        // Load agent steps
        let steps = StationStep::find_by_station(&self.pool, station.id).await?;

        // Execute steps in sequence
        for step in steps {
            self.execute_step(task, station, &step).await?;
        }

        Ok(())
    }

    async fn execute_step(
        &self,
        task: &Task,
        station: &WorkflowStation,
        step: &StationStep,
    ) -> Result<(), WorkflowError> {
        // 1. Load agent
        let agent = Agent::find_by_id(&self.pool, step.agent_id).await?;

        // 2. Build prompt (combine agent system prompt + step prompt + task)
        let prompt = format!(
            "{}\n\n{}\n\nTask: {}",
            agent.system_prompt,
            step.step_prompt.as_deref().unwrap_or(""),
            task.to_prompt()
        );

        // 3. Execute using existing executor system
        // This integrates with vibe-kanban's existing task_attempt execution
        let task_attempt = TaskAttempt::create(&self.pool, CreateTaskAttempt {
            task_id: task.id,
            executor: "CLAUDE_CODE".to_string(), // or from agent config
            // ... other fields
        }).await?;

        // 4. Track step execution
        TaskStepExecution::create(&self.pool, CreateTaskStepExecution {
            task_attempt_id: task_attempt.id,
            station_step_id: step.id,
            agent_id: agent.id,
            status: "running".to_string(),
        }).await?;

        // 5. Use existing executor to run the task
        // This hooks into vibe-kanban's existing execution infrastructure

        Ok(())
    }
}
```

## Frontend Implementation

### Phase 1: Install ReactFlow

```bash
cd frontend
pnpm add reactflow@11 @xyflow/react
```

### Phase 2: Create Factory Floor Web Components

**Location**: `frontend/src/components/factory-floor/`

These are **React components for the browser**, not desktop components:

```
factory-floor/
├── FactoryFloorView.tsx          # Main container (tab in layout)
├── WorkflowVisualBuilder.tsx     # ReactFlow workflow designer
├── StationNode.tsx                # Custom ReactFlow node for stations
├── StationEditor.tsx              # Modal for creating/editing stations
├── StationStepManager.tsx         # Modal for managing station steps
├── AgentPoolManager.tsx           # Global agent CRUD
└── WorkflowExecutionMonitor.tsx  # Real-time workflow execution view
```

### Phase 3: Key Components

#### WorkflowVisualBuilder.tsx
Adaptation of emerge's `FactoryAssemblyLine.tsx` for vibe-kanban's **web UI** (uses HTTP fetch, not Tauri invoke):

```tsx
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Panel,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { StationNode } from './StationNode';
import { StationEditor } from './StationEditor';

interface WorkflowVisualBuilderProps {
  workflowId: string;
  projectId: string;
}

export function WorkflowVisualBuilder({ workflowId, projectId }: WorkflowVisualBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);

  // Load workflow data from HTTP API (web-based, not Tauri)
  useEffect(() => {
    loadWorkflowData();
  }, [workflowId]);

  const loadWorkflowData = async () => {
    // Standard HTTP fetch to Axum backend
    const stations = await fetch(`/api/workflows/${workflowId}/stations`).then(r => r.json());
    const transitions = await fetch(`/api/workflows/${workflowId}/transitions`).then(r => r.json());

    // Convert to ReactFlow nodes/edges
    const flowNodes = stations.map(station => ({
      id: station.id,
      type: 'station',
      position: { x: station.x_position, y: station.y_position },
      data: {
        label: station.name,
        description: station.description,
        stationId: station.id,
        onEdit: () => setSelectedStation(station.id),
        onDelete: () => handleDeleteStation(station.id),
      },
    }));

    const flowEdges = transitions.map(transition => ({
      id: transition.id,
      source: transition.source_station_id,
      target: transition.target_station_id,
      label: transition.label,
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  const nodeTypes = {
    station: StationNode,
  };

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} />
        <MiniMap />
        <Panel position="top-right">
          <button onClick={handleAddStation}>Add Station</button>
        </Panel>
      </ReactFlow>

      {selectedStation && (
        <StationEditor
          stationId={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
}
```

#### StationNode.tsx
Custom ReactFlow node matching vibe-kanban's visual language:

```tsx
import { Handle, Position } from 'reactflow';

export function StationNode({ data }: any) {
  return (
    <div className="bg-card border-2 border-primary rounded-lg p-3 min-w-[200px] shadow-lg">
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-primary"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-primary"
      />

      <div className="font-semibold text-sm mb-2 flex items-center justify-between">
        <span>{data.label}</span>
        <div className="flex gap-1">
          <button
            onClick={data.onEdit}
            className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80"
          >
            Edit
          </button>
          <button
            onClick={data.onDelete}
            className="text-xs px-2 py-1 bg-destructive rounded hover:bg-destructive/80"
          >
            Delete
          </button>
        </div>
      </div>

      {data.description && (
        <p className="text-xs text-muted-foreground">{data.description}</p>
      )}
    </div>
  );
}
```

#### StationEditor.tsx
Modal for editing station steps (adapted from emerge's `StationFlowEditor.tsx`):

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

interface StationEditorProps {
  stationId: string;
  onClose: () => void;
}

export function StationEditor({ stationId, onClose }: StationEditorProps) {
  const [steps, setSteps] = useState<StationStep[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    loadStationSteps();
    loadAgents();
  }, [stationId]);

  const loadStationSteps = async () => {
    const data = await fetch(`/api/stations/${stationId}/steps`).then(r => r.json());
    setSteps(data);
  };

  const loadAgents = async () => {
    const data = await fetch('/api/agents').then(r => r.json());
    setAgents(data);
  };

  const handleAddStep = async (agentId: string, stepPrompt: string) => {
    await fetch(`/api/stations/${stationId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        position: steps.length,
        step_prompt: stepPrompt,
      }),
    });
    loadStationSteps();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Station Steps</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* List existing steps */}
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div key={step.id} className="border rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Step {index + 1}</span>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteStep(step.id)}>
                    Delete
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  Agent: {agents.find(a => a.id === step.agent_id)?.name || 'Unknown'}
                </div>
                {step.step_prompt && (
                  <div className="text-sm mt-2">{step.step_prompt}</div>
                )}
              </div>
            ))}
          </div>

          {/* Add new step form */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">Add New Step</h3>
            {/* Form fields for agent selection and step prompt */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Phase 4: Integration with Existing Layout

Add Factory Floor tab to main layout (`frontend/src/pages/ProjectPage.tsx` or similar):

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowVisualBuilder } from '@/components/factory-floor/WorkflowVisualBuilder';

export function ProjectPage() {
  return (
    <Tabs defaultValue="tasks">
      <TabsList>
        <TabsTrigger value="tasks">Tasks</TabsTrigger>
        <TabsTrigger value="factory">Factory Floor</TabsTrigger>
        <TabsTrigger value="agents">Agents</TabsTrigger>
      </TabsList>

      <TabsContent value="tasks">
        {/* Existing task view */}
      </TabsContent>

      <TabsContent value="factory">
        <WorkflowVisualBuilder workflowId={currentWorkflow} projectId={projectId} />
      </TabsContent>

      <TabsContent value="agents">
        <AgentPoolManager />
      </TabsContent>
    </Tabs>
  );
}
```

## Implementation Phases

### Phase 1: Database Foundation (Week 1)
- [ ] Create migration file with all new tables
- [ ] Implement Rust models in `crates/db/src/models/`
- [ ] Add CRUD methods for all models
- [ ] Run `pnpm run generate-types` to generate TypeScript types
- [ ] Test with unit tests

### Phase 2: Backend API (Week 1-2)
- [ ] Create route modules for agents, workflows, stations, steps
- [ ] Implement all CRUD endpoints
- [ ] Add SSE events for workflow execution updates
- [ ] Test with integration tests

### Phase 3: Frontend - Agent Management (Week 2)
- [ ] Create AgentPoolManager component
- [ ] Build agent creation/edit forms
- [ ] Integrate with backend API
- [ ] Test CRUD operations

### Phase 4: Frontend - Workflow Builder (Week 2-3)
- [ ] Install ReactFlow
- [ ] Create WorkflowVisualBuilder component
- [ ] Implement StationNode custom node
- [ ] Add station creation/editing
- [ ] Implement drag-to-reposition
- [ ] Add transition creation (edge connections)

### Phase 5: Frontend - Station Steps (Week 3)
- [ ] Create StationEditor modal
- [ ] Implement step management UI
- [ ] Add agent assignment to steps
- [ ] Test step ordering

### Phase 6: Workflow Orchestration (Week 3-4)
- [ ] Implement WorkflowOrchestrator service
- [ ] Integrate with existing executor system
- [ ] Add workflow execution tracking
- [ ] Emit SSE events for UI updates

### Phase 7: Factory Floor Monitoring (Week 4)
- [ ] Create WorkflowExecutionMonitor component
- [ ] Show real-time workflow progress
- [ ] Display agent execution status
- [ ] Add controls (pause, restart, etc.)

### Phase 8: Integration & Polish (Week 4-5)
- [ ] Integrate factory floor tab into main UI
- [ ] Add workflow selection/creation to projects
- [ ] Polish UI to match vibe-kanban visual language
- [ ] Add comprehensive error handling
- [ ] Write end-to-end tests

## Key Design Decisions

### 1. Global Agent Pool vs. Executor Profiles
- **Decision**: Keep both
- **Rationale**:
  - Executor profiles are per-project configurations
  - Global agents are reusable across all projects
  - Agents can reference executor profiles for their configuration

### 2. SSE vs. WebSocket
- **Decision**: Use existing SSE infrastructure
- **Rationale**:
  - vibe-kanban already has SSE for task execution updates
  - Unidirectional updates (server → client) are sufficient
  - Less complexity than WebSockets

### 3. Workflow Execution Model
- **Decision**: Extend existing TaskAttempt system
- **Rationale**:
  - Each station step creates a TaskAttempt
  - Reuse existing executor infrastructure
  - Maintain compatibility with existing task execution

### 4. UI Component Library
- **Decision**: Use existing shadcn/ui + Tailwind
- **Rationale**:
  - Consistent with vibe-kanban's design system
  - ReactFlow integrates well with Tailwind
  - Minimal new dependencies

## Testing Strategy

### Backend Tests
- Unit tests for all model CRUD operations
- Integration tests for API endpoints
- Workflow orchestration tests with mock executors

### Frontend Tests
- Component tests for all new components
- Integration tests for workflow builder interactions
- E2E tests for complete workflow creation and execution

## Migration Path

For existing vibe-kanban users:
1. Workflows are optional - existing task execution continues to work
2. Projects without workflows use existing single-task execution
3. Projects with workflows can mix workflow tasks and regular tasks
4. Migration tool to convert existing projects to workflow-based projects

## Future Enhancements

1. **Conditional Transitions**: Implement `condition` field in station_transitions
2. **Parallel Station Execution**: Allow multiple agents to work on different stations simultaneously
3. **Workflow Templates**: Pre-built workflow templates for common patterns
4. **Agent Capabilities Matching**: Auto-suggest agents based on task requirements
5. **Visual Diff**: Show changes between workflow versions
6. **Workflow Analytics**: Track execution time, success rate per station

## Technology Stack Summary

**This is a pure web application running in the browser:**

### Backend (Rust)
- Axum HTTP server (already running in vibe-kanban)
- SQLite database (already in use)
- Server-Sent Events for real-time updates (already implemented)
- No Tauri, no desktop app, no IPC

### Frontend (Browser)
- React 18 + TypeScript (already in use)
- ReactFlow for visual workflow editor (new dependency)
- shadcn/ui + Tailwind CSS (already in use)
- Standard HTTP fetch for API calls
- EventSource for SSE subscriptions (already in use)

### Development
- `pnpm run dev` - Runs both backend and frontend (existing workflow)
- Backend: `http://localhost:[auto-assigned]`
- Frontend: `http://localhost:3000`
- No desktop build, no Tauri CLI, no native compilation

## References

- emerge-code-factory codebase (for concepts only): `~/code/emerge/emerge-code-factory`
- vibe-kanban codebase (web implementation): `~/code/emerge/vibe-factory`
- ReactFlow docs: https://reactflow.dev/
- shadcn/ui docs: https://ui.shadcn.com/
- Axum docs: https://docs.rs/axum/

---

**Next Steps**: Review this plan, then begin with Phase 1 (Database Foundation).
