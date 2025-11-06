# Phase 2 Tasks - Factory Floor Visual Workflow Builder

**Goal**: Build complete drag-and-drop visual workflow builder with React Flow

**Architecture**: Web-based UI with REST API backend, supporting one agent per station with conditional transitions

---

## Task 2.1: Create Workflow API Routes (Backend)

**Title:** Phase 2.1 - Create Workflow API Routes

**Description:**
Create REST API endpoints in `crates/server/src/routes/workflows.rs` for managing workflows, stations, and transitions.

### Routes to Implement:

#### Workflow Routes
```rust
GET    /api/projects/:projectId/workflows      - List all workflows for project
POST   /api/projects/:projectId/workflows      - Create new workflow
GET    /api/workflows/:id                      - Get workflow by ID (with stations & transitions)
PUT    /api/workflows/:id                      - Update workflow
DELETE /api/workflows/:id                      - Delete workflow
```

#### Station Routes
```rust
GET    /api/workflows/:workflowId/stations     - List all stations in workflow
POST   /api/workflows/:workflowId/stations     - Add station to workflow
PUT    /api/stations/:id                       - Update station
DELETE /api/stations/:id                       - Delete station
```

#### Transition Routes
```rust
GET    /api/workflows/:workflowId/transitions  - List all transitions in workflow
POST   /api/workflows/:workflowId/transitions  - Create transition
PUT    /api/transitions/:id                    - Update transition
DELETE /api/transitions/:id                    - Delete transition
```

### Implementation Pattern:

Follow existing patterns from `crates/server/src/routes/agents.rs`:
- Use `State<DeploymentImpl>` for database access
- Use `Json<Payload>` for request bodies
- Return `ResponseJson<ApiResponse<T>>` for success
- Return `ApiError` for errors
- Add analytics tracking for workflow operations

### Special Requirements:

**GET /api/workflows/:id** should return:
```rust
WorkflowWithDetails {
    workflow: Workflow,
    stations: Vec<WorkflowStation>,
    transitions: Vec<StationTransition>,
}
```

**DELETE /api/workflows/:id** should cascade:
- Delete all stations
- Delete all transitions
- Unassign any tasks using this workflow

### Acceptance Criteria:
- All 14 routes implemented and working
- Proper error handling (404 for not found, 403 for permission denied)
- Analytics tracking for create/update/delete operations
- Routes registered in `crates/server/src/routes/mod.rs`
- Compiles without errors

**Estimated:** 4-6 hours

---

## Task 2.2: Create Frontend Workflow API Client

**Title:** Phase 2.2 - Create Frontend Workflow API Client

**Description:**
Add workflow, station, and transition API functions to `frontend/src/lib/api.ts`.

### Functions to Add:

```typescript
// Workflows
export const workflowsApi = {
  list: async (projectId: string): Promise<Workflow[]>
  get: async (workflowId: string): Promise<WorkflowWithDetails>
  create: async (projectId: string, data: CreateWorkflow): Promise<Workflow>
  update: async (workflowId: string, data: UpdateWorkflow): Promise<Workflow>
  delete: async (workflowId: string): Promise<void>
}

// Stations
export const stationsApi = {
  list: async (workflowId: string): Promise<WorkflowStation[]>
  create: async (workflowId: string, data: CreateWorkflowStation): Promise<WorkflowStation>
  update: async (stationId: string, data: UpdateWorkflowStation): Promise<WorkflowStation>
  delete: async (stationId: string): Promise<void>
}

// Transitions
export const transitionsApi = {
  list: async (workflowId: string): Promise<StationTransition[]>
  create: async (workflowId: string, data: CreateStationTransition): Promise<StationTransition>
  update: async (transitionId: string, data: UpdateStationTransition): Promise<StationTransition>
  delete: async (transitionId: string): Promise<void>
}
```

### Pattern:
Follow existing `agentsApi` pattern:
- Use `makeRequest()` helper
- Use `handleApiResponse<T>()` for type safety
- Proper error handling

### Acceptance Criteria:
- All 14 API functions implemented
- TypeScript types from `shared/types.ts`
- Proper error handling
- Follows existing API client patterns

**Estimated:** 1-2 hours

---

## Task 2.3: Create Station Node Component

**Title:** Phase 2.3 - Create Station Node Component

**Description:**
Create React Flow custom node component for workflow stations in `frontend/src/components/factory/StationNode.tsx`.

### Component Features:

```typescript
StationNode {
  - Display station name
  - Display assigned agent (name + avatar)
  - Show station status indicator (idle, running, completed, failed)
  - Drag to reposition on canvas
  - Click to open configuration panel
  - Connection handles (input at top, output at bottom)
  - Visual styling based on status
}
```

### Visual Design:

```
┌──────────────────────────────┐
│  📍 Design Station           │ ← Station name
├──────────────────────────────┤
│  👤 Design Agent             │ ← Assigned agent
│  📝 Create high-level design │ ← Station prompt (truncated)
├──────────────────────────────┤
│  ⚙️  Configure   🗑️ Remove   │ ← Actions
└──────────────────────────────┘
```

### Status Colors:
- **Gray**: Idle (not assigned to any task)
- **Blue**: Running (task currently executing)
- **Green**: Completed (last execution successful)
- **Red**: Failed (last execution failed)

### Props:
```typescript
interface StationNodeProps {
  data: {
    station: WorkflowStation;
    agent?: Agent;
    status?: 'idle' | 'running' | 'completed' | 'failed';
    onConfigure: (station: WorkflowStation) => void;
    onDelete: (stationId: string) => void;
  };
}
```

### Acceptance Criteria:
- Renders as custom React Flow node
- Shows station info and agent
- Clickable to configure
- Draggable to reposition
- Connection handles functional
- Responsive styling

**Estimated:** 2-3 hours

---

## Task 2.4: Create Connection Edge Component

**Title:** Phase 2.4 - Create Connection Edge Component

**Description:**
Create React Flow custom edge component for station transitions in `frontend/src/components/factory/TransitionEdge.tsx`.

### Component Features:

```typescript
TransitionEdge {
  - Labeled edge (shows condition type)
  - Color coded by condition:
    • Green: "always" or "on_approval"
    • Red: "on_failure" or "on_rejection"
    • Blue: "on_tests_pass"
    • Yellow: "on_tests_fail"
  - Animated for active transitions
  - Click to edit condition
  - Shows loopback indicator (🔁) when target comes before source
}
```

### Visual Examples:

```
Station A ──[on_success]──→ Station B    (green, solid)
Station A ──[on_failure]──→ Station A    (red, dashed, 🔁 loopback)
Station B ──[on_tests_fail]──→ Station A (yellow, dashed, 🔁 loopback)
```

### Props:
```typescript
interface TransitionEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  data: {
    transition: StationTransition;
    isLoopback: boolean;
    onClick: (transition: StationTransition) => void;
  };
}
```

### Special Requirements:
- Detect loopbacks: target station position < source station position
- Show 🔁 icon on loopback edges
- Dashed line style for failure conditions
- Click anywhere on edge to edit

### Acceptance Criteria:
- Custom React Flow edge component
- Color coded by condition type
- Loopback detection and indicator
- Clickable to edit
- Animated when active

**Estimated:** 2-3 hours

---

## Task 2.5: Create Workflow Toolbar Component

**Title:** Phase 2.5 - Create Workflow Toolbar Component

**Description:**
Create toolbar above React Flow canvas in `frontend/src/components/factory/WorkflowToolbar.tsx`.

### Toolbar Features:

```typescript
WorkflowToolbar {
  - Workflow selector dropdown (switch between workflows)
  - "New Workflow" button
  - "Save Changes" button (shows unsaved indicator)
  - "Delete Workflow" button
  - Zoom controls (+/- buttons)
  - "Auto Layout" button (arrange stations nicely)
  - "Export JSON" button (download workflow definition)
}
```

### Visual Layout:

```
┌────────────────────────────────────────────────────────────┐
│ [Workflow: Design → Code → Test ▼] [+ New] [Save*] [🗑️]   │
│                                     [Zoom: - 100% +]        │
│                                     [Auto Layout] [Export]  │
└────────────────────────────────────────────────────────────┘
```

### Props:
```typescript
interface WorkflowToolbarProps {
  workflows: Workflow[];
  currentWorkflowId?: string;
  hasUnsavedChanges: boolean;
  onWorkflowChange: (workflowId: string) => void;
  onNewWorkflow: () => void;
  onSave: () => void;
  onDelete: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAutoLayout: () => void;
  onExport: () => void;
}
```

### Acceptance Criteria:
- All buttons functional
- Workflow dropdown works
- Shows unsaved changes indicator (*)
- Responsive layout
- Keyboard shortcuts (Ctrl+S for save)

**Estimated:** 2 hours

---

## Task 2.6: Create Station Configuration Panel

**Title:** Phase 2.6 - Create Station Configuration Panel

**Description:**
Create side panel for configuring station details in `frontend/src/components/factory/StationConfigPanel.tsx`.

### Panel Features:

```typescript
StationConfigPanel {
  - Station name input
  - Agent dropdown (select from available agents)
  - Station prompt textarea (custom instructions for this station)
  - Output context keys input (comma-separated: "design_doc, api_spec")
  - Position inputs (x, y coordinates)
  - "Save Changes" button
  - "Remove Station" button
  - "Close" button
}
```

### Visual Layout:

```
┌─────────────────────────────────┐
│  Configure Station              │
├─────────────────────────────────┤
│  Name: [Design Station        ] │
│                                 │
│  Agent: [Design Agent      ▼]  │
│                                 │
│  Instructions:                  │
│  ┌───────────────────────────┐ │
│  │ Create high-level design  │ │
│  │ focusing on architecture  │ │
│  └───────────────────────────┘ │
│                                 │
│  Outputs: [design_doc, ...   ] │
│                                 │
│  Position: X [100] Y [200]      │
│                                 │
│  [Save Changes] [Remove] [×]    │
└─────────────────────────────────┘
```

### Props:
```typescript
interface StationConfigPanelProps {
  station: WorkflowStation | null;
  agents: Agent[];
  onSave: (data: UpdateWorkflowStation) => void;
  onDelete: (stationId: string) => void;
  onClose: () => void;
}
```

### Validation:
- Station name required
- Agent must be selected
- Output context keys must be valid JSON array

### Acceptance Criteria:
- Form with all station fields
- Agent dropdown populated
- Save updates station
- Remove deletes station
- Validation errors shown
- Slide-in/out animation

**Estimated:** 3 hours

---

## Task 2.7: Create Transition Configuration Dialog

**Title:** Phase 2.7 - Create Transition Configuration Dialog

**Description:**
Create modal dialog for configuring transition conditions in `frontend/src/components/factory/TransitionConfigDialog.tsx`.

### Dialog Features:

```typescript
TransitionConfigDialog {
  - Source station (read-only, show name)
  - Target station (read-only, show name)
  - Condition type dropdown:
    • always
    • on_approval
    • on_rejection
    • on_tests_pass
    • on_tests_fail
  - Condition value textarea (JSON for complex conditions)
  - Label input (custom display text)
  - Loopback warning (if target is earlier station)
  - "Save Changes" button
  - "Remove Transition" button
  - "Cancel" button
}
```

### Visual Layout:

```
┌─────────────────────────────────────┐
│  Configure Transition               │
├─────────────────────────────────────┤
│  From: Design Station →             │
│  To:   Code Station                 │
│                                     │
│  🔁 Warning: This is a loopback     │
│     (returns to earlier station)    │
│                                     │
│  Condition: [on_failure        ▼]  │
│                                     │
│  Label: [Try design again      ]   │
│                                     │
│  Advanced (JSON):                   │
│  ┌─────────────────────────────┐   │
│  │ { "max_attempts": 3 }       │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Save] [Remove Transition] [×]    │
└─────────────────────────────────────┘
```

### Props:
```typescript
interface TransitionConfigDialogProps {
  transition: StationTransition;
  sourceStation: WorkflowStation;
  targetStation: WorkflowStation;
  isLoopback: boolean;
  onSave: (data: UpdateStationTransition) => void;
  onDelete: (transitionId: string) => void;
  onClose: () => void;
}
```

### Condition Types:
- `always` - Always take this path
- `on_approval` - After human approval
- `on_rejection` - After human rejection
- `on_tests_pass` - When tests succeed
- `on_tests_fail` - When tests fail

### Acceptance Criteria:
- Modal dialog with form
- Condition type dropdown
- Loopback warning shown when applicable
- Save updates transition
- Remove deletes transition
- JSON validation for condition_value

**Estimated:** 2-3 hours

---

## Task 2.8: Create Agent Palette Component

**Title:** Phase 2.8 - Create Agent Palette Component

**Description:**
Create draggable agent palette for adding stations in `frontend/src/components/factory/AgentPalette.tsx`.

### Palette Features:

```typescript
AgentPalette {
  - List all available agents
  - Each agent is draggable
  - Drag agent onto canvas to create station
  - Show agent name, role, executor
  - Search/filter agents
  - Link to /agents page
  - "Create New Agent" button
}
```

### Visual Layout:

```
┌──────────────────────┐
│  🤖 Agent Palette    │
├──────────────────────┤
│  [Search agents...] │
│                      │
│  👤 Design Agent     │ ← Draggable
│     Role: Designer   │
│                      │
│  👤 Code Agent       │ ← Draggable
│     Role: Developer  │
│                      │
│  👤 Test Agent       │ ← Draggable
│     Role: QA         │
│                      │
│  + Create New Agent  │
└──────────────────────┘
```

### Drag Behavior:
- Drag agent from palette
- Drop on canvas to create new station
- Station positioned at drop location
- Auto-assign dragged agent to new station
- Show drag preview while dragging

### Props:
```typescript
interface AgentPaletteProps {
  agents: Agent[];
  onCreateStation: (agent: Agent, position: { x: number, y: number }) => void;
}
```

### Acceptance Criteria:
- Lists all agents from API
- Agents are draggable
- Drop creates station on canvas
- Search filters agent list
- Link to agents page works
- Responsive sidebar layout

**Estimated:** 2 hours

---

## Task 2.9: Create Workflow Persistence Hooks

**Title:** Phase 2.9 - Create Workflow Persistence Hooks

**Description:**
Create React hooks for managing workflow state and syncing with backend in `frontend/src/hooks/`.

### Hooks to Create:

#### 1. useWorkflow Hook
```typescript
// frontend/src/hooks/useWorkflow.ts

export function useWorkflow(workflowId: string) {
  // Load workflow from API
  // Convert DB format to React Flow format
  // Auto-save changes (debounced)
  // Handle optimistic updates

  return {
    workflow: Workflow | null,
    stations: WorkflowStation[],
    transitions: StationTransition[],
    isLoading: boolean,
    isSaving: boolean,
    hasUnsavedChanges: boolean,
    saveWorkflow: () => Promise<void>,
    updateWorkflow: (data: UpdateWorkflow) => Promise<void>,
    deleteWorkflow: () => Promise<void>,
  }
}
```

#### 2. useWorkflowStations Hook
```typescript
// frontend/src/hooks/useWorkflowStations.ts

export function useWorkflowStations(workflowId: string) {
  // Manage stations in workflow
  // Add/update/delete stations
  // Sync positions with canvas
  // Handle drag-and-drop

  return {
    stations: WorkflowStation[],
    addStation: (agent: Agent, position: XYPosition) => Promise<void>,
    updateStation: (stationId: string, data: UpdateWorkflowStation) => Promise<void>,
    deleteStation: (stationId: string) => Promise<void>,
    updatePosition: (stationId: string, position: XYPosition) => void,
  }
}
```

#### 3. useWorkflowTransitions Hook
```typescript
// frontend/src/hooks/useWorkflowTransitions.ts

export function useWorkflowTransitions(workflowId: string) {
  // Manage transitions
  // Add/update/delete transitions
  // Validate no infinite loops
  // Detect loopbacks

  return {
    transitions: StationTransition[],
    addTransition: (sourceId: string, targetId: string) => Promise<void>,
    updateTransition: (transitionId: string, data: UpdateStationTransition) => Promise<void>,
    deleteTransition: (transitionId: string) => Promise<void>,
    isLoopback: (sourceId: string, targetId: string) => boolean,
  }
}
```

#### 4. useReactFlowSync Hook
```typescript
// frontend/src/hooks/useReactFlowSync.ts

export function useReactFlowSync(
  stations: WorkflowStation[],
  transitions: StationTransition[]
) {
  // Convert workflow data to React Flow nodes and edges
  // Convert React Flow changes back to workflow data
  // Handle position updates
  // Handle connection creation

  return {
    nodes: Node[],
    edges: Edge[],
    onNodesChange: NodeChange => void,
    onEdgesChange: EdgeChange => void,
    onConnect: Connection => void,
  }
}
```

### Acceptance Criteria:
- All 4 hooks implemented
- Proper TypeScript types
- React Query for API calls
- Optimistic updates
- Error handling
- Debounced auto-save (1 second)

**Estimated:** 4-5 hours

---

## Task 2.10: Update Factory Floor Page with Full Workflow Builder

**Title:** Phase 2.10 - Update Factory Floor Page with Full Workflow Builder

**Description:**
Integrate all workflow builder components into the Factory Floor page.

### Updates to `frontend/src/pages/factory-floor.tsx`:

```typescript
<FactoryFloorPage>
  - Add WorkflowToolbar at top
  - Add AgentPalette on left side
  - Update React Flow canvas with:
    • Custom StationNode components
    • Custom TransitionEdge components
    • Drag-and-drop from agent palette
    • Click handlers for configuration
  - Add StationConfigPanel (slide-in from right)
  - Add TransitionConfigDialog (modal)
  - Integrate all workflow hooks
  - Handle all user interactions
  - Auto-save workflow changes
</FactoryFloorPage>
```

### Layout:

```
┌─────────────────────────────────────────────────────────┐
│  Workflow Toolbar (top)                                 │
├─────────┬───────────────────────────────┬───────────────┤
│ Agent   │                               │  Station      │
│ Palette │   React Flow Canvas          │  Config       │
│ (left)  │   - Custom station nodes      │  Panel        │
│         │   - Custom transition edges   │  (right,      │
│ [Agent] │   - Drag from palette         │   slide-in)   │
│ [Agent] │   - Click to configure        │               │
│ [Agent] │                               │               │
├─────────┴───────────────────────────────┴───────────────┤
│  Todo/In Progress Task Trays (bottom)                   │
└─────────────────────────────────────────────────────────┘
```

### Features to Implement:

1. **Workflow Loading**
   - Load workflow list on mount
   - Load selected workflow details
   - Convert to React Flow format

2. **Station Management**
   - Drag agent from palette → create station
   - Click station → open config panel
   - Update station → save to backend
   - Delete station → remove from canvas

3. **Transition Management**
   - Click + drag between stations → create transition
   - Click edge → open config dialog
   - Update transition → save to backend
   - Delete transition → remove from canvas

4. **Auto-Save**
   - Debounce position changes (1 second)
   - Auto-save on any modification
   - Show "Saving..." indicator
   - Show "Saved ✓" confirmation

5. **Validation**
   - Warn about orphan stations (no connections)
   - Warn about infinite loops
   - Highlight loopback transitions

### Acceptance Criteria:
- All components integrated
- Drag-and-drop works
- Configuration panels work
- Auto-save functional
- Workflow persisted to backend
- No console errors
- Responsive layout

**Estimated:** 3-4 hours

---

## Summary

**Phase 2 Total**: 10 tasks, **25-35 hours** estimated

### Task Breakdown:
1. **2.1** - Workflow API Routes (4-6h)
2. **2.2** - Frontend API Client (1-2h)
3. **2.3** - Station Node Component (2-3h)
4. **2.4** - Connection Edge Component (2-3h)
5. **2.5** - Workflow Toolbar (2h)
6. **2.6** - Station Config Panel (3h)
7. **2.7** - Transition Config Dialog (2-3h)
8. **2.8** - Agent Palette (2h)
9. **2.9** - Workflow Persistence Hooks (4-5h)
10. **2.10** - Update Factory Floor Page (3-4h)

### Dependencies:
- Tasks 2.1 and 2.2 must be done first (API layer)
- Tasks 2.3-2.8 can be done in parallel (UI components)
- Task 2.9 requires 2.1-2.2 (needs API)
- Task 2.10 requires all other tasks (integration)

### Output:
Complete visual workflow builder with drag-and-drop stations, connection drawing, loopback indicators, and full persistence to database.
