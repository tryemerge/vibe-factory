# Manager Agent Architecture

## Executive Summary

The Manager Agent is a project-level AI assistant that automates task creation, feature breakdown, and backlog organization. Unlike the existing task-level agent (which executes code changes within a single task), the Manager Agent operates at the project level to help developers plan and organize their work.

**Key Insight**: Rather than building a separate system, the Manager Agent reuses the existing task-level agent infrastructure (executors, streaming logs, retries, approvals) while operating in a different context (project-level instead of task-level).

## The Goal

### What We Want to Achieve

1. **Automated Task Creation**: Developer describes a feature ("Add user authentication with OAuth, login/logout endpoints, and tests"), Manager Agent creates multiple related tasks
2. **Intelligent Breakdown**: AI parses natural language and uses domain knowledge to create well-structured, properly sequenced tasks
3. **MCP Integration**: Manager Agent uses the existing MCP (Model Context Protocol) server to interact with project data
4. **Unified UX**: Reuse the full task-level agent interface (TaskFollowUpSection) so developers get identical experience with streaming logs, retries, image uploads, etc.

### Example Usage

```
Developer: "Create tasks for implementing user authentication:
OAuth setup, login endpoint, logout endpoint, session
management, and integration tests"

Manager Agent (via Claude):
✓ Created task: "Set up OAuth provider configuration"
✓ Created task: "Implement /auth/login endpoint"
✓ Created task: "Implement /auth/logout endpoint"
✓ Created task: "Add session management middleware"
✓ Created task: "Write integration tests for auth flow"
```

## What Makes This Hard

### Challenge 1: Task-Centric Architecture

The existing agent system is deeply integrated with the **task execution model**:

```rust
// Current: Everything revolves around TaskAttempt
pub struct TaskAttempt {
    pub id: Uuid,
    pub task_id: Uuid,              // ← Requires a task!
    pub executor: String,
    pub base_branch: String,
    pub worktree_path: Option<String>, // ← Git worktree for code changes
    pub status: TaskAttemptStatus,
    // ...
}
```

**Problem**: Manager Agent doesn't modify code, so it doesn't need:
- A specific task_id (it operates on the whole project)
- A git worktree (no code changes)
- Many task-specific fields

**Solution**: Create a parallel `ManagerExecution` model that shares the execution infrastructure but has project-level semantics.

### Challenge 2: Component Coupling

The `TaskFollowUpSection` component (600+ lines) is tightly coupled to task concepts:

```tsx
// frontend/src/components/tasks/TaskFollowUpSection.tsx
export function TaskFollowUpSection({ taskId }: { taskId: string }) {
  const { task } = useTask(taskId);              // ← Task-specific hook
  const { taskAttempts } = useTaskAttempts(taskId); // ← Fetches task attempts
  const { executionProcess } = useExecutionProcess(attemptId);

  // Shows task-specific context: task title, description, worktree info
  // ...
}
```

**Problem**: Component assumes:
- There's always a task
- Executions are TaskAttempts
- Context is task-scoped (title, description, files changed)

**Solution**: Abstract the component with a `context` prop:
```tsx
type AgentContext =
  | { type: 'task'; taskId: string }
  | { type: 'manager'; projectId: string }

export function TaskFollowUpSection({ context }: { context: AgentContext })
```

### Challenge 3: Execution Lifecycle Differences

**Task Execution Lifecycle**:
1. Create TaskAttempt with task_id, executor, base_branch
2. Allocate git worktree
3. Start executor process (runs Claude Code in worktree)
4. Stream logs, diffs, terminal output
5. On completion: parse changes, update task status
6. Cleanup worktree

**Manager Execution Lifecycle** (Different!):
1. Create ManagerExecution with project_id, executor
2. NO worktree allocation (not modifying code)
3. Start executor process (runs Claude with MCP context)
4. Stream logs of AI thinking/planning
5. On completion: parse created tasks, update project view
6. NO cleanup needed

**Key Difference**: Manager executions create **tasks as output**, not code changes.

### Challenge 4: Streaming Different Data

**Task-level streams**:
- Git diffs (code changes)
- Terminal output (test runs, builds)
- File changes in worktree

**Manager-level streams**:
- AI reasoning logs ("Analyzing feature request...")
- MCP tool calls (`bulk_create_tasks` invocations)
- Task creation confirmations ("Created task: X")

**Solution**: Both use ExecutionProcess events, but interpret them differently in the UI.

## How The Current System Works

### 1. Task Execution Model

```
┌─────────────────────────────────────────────────────────────┐
│                         TaskAttempt                         │
├─────────────────────────────────────────────────────────────┤
│ - task_id: Links to specific task                          │
│ - executor: Which AI agent (CLAUDE_CODE, GEMINI, etc.)     │
│ - base_branch: Git branch to start from                    │
│ - worktree_path: Isolated git worktree for changes         │
│ - status: PENDING → RUNNING → COMPLETED/FAILED             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    ExecutionProcess                         │
├─────────────────────────────────────────────────────────────┤
│ - process_id: Unique identifier                            │
│ - task_attempt_id: Links to TaskAttempt                    │
│ - status: Tracks subprocess state                          │
│ - command: Actual executor command (claude-code, etc.)     │
│ - Events: Streamed to frontend via SSE                     │
└─────────────────────────────────────────────────────────────┘
```

### 2. Execution Flow

```rust
// 1. Create TaskAttempt (API: POST /api/task-attempts)
let attempt = TaskAttempt::create(CreateTaskAttempt {
    task_id,
    executor: "CLAUDE_CODE",
    base_branch: "main",
    status: TaskAttemptStatus::Pending,
});

// 2. Allocate Worktree
let worktree_path = worktree_manager
    .allocate_worktree(&task.id, &base_branch)
    .await?;

// 3. Start Executor Process
let process = ExecutionProcess::start(
    executor,
    worktree_path,
    task_description,
).await?;

// 4. Stream Events
// - process.logs → Real-time stdout/stderr
// - process.status_changes → RUNNING → COMPLETED
// - Streamed to frontend via /api/events/processes/:id/logs

// 5. On Completion
// - Parse git diff from worktree
// - Update task status
// - Cleanup worktree (or preserve for review)
```

### 3. Frontend Integration (TaskFollowUpSection)

```tsx
export function TaskFollowUpSection({ taskId }: { taskId: string }) {
  // 1. Fetch task data
  const { task } = useTask(taskId);

  // 2. Fetch task attempts
  const { taskAttempts, createAttempt } = useTaskAttempts(taskId);
  const latestAttempt = taskAttempts[0];

  // 3. Subscribe to execution process events
  const { logs, status } = useExecutionProcess(latestAttempt?.execution_process_id);

  // 4. Render UI
  return (
    <div>
      {/* Task context: title, description */}
      <TaskHeader task={task} />

      {/* Chat history: previous attempts, conversations */}
      <ChatHistory attempts={taskAttempts} />

      {/* Live logs: streaming from current execution */}
      <StreamingLogs logs={logs} status={status} />

      {/* Input: send follow-up messages, retry, approve */}
      <ChatInput onSend={handleSend} onRetry={handleRetry} />
    </div>
  );
}
```

### 4. Key Infrastructure Components

**Backend (Rust)**:
- `crates/db/src/models/task_attempt.rs`: TaskAttempt model and DB queries
- `crates/server/src/routes/task_attempts.rs`: API endpoints for attempts
- `crates/executors/`: Executor implementations (Claude, Gemini, etc.)
- `crates/services/src/execution_process.rs`: Process lifecycle management
- `crates/server/src/routes/events.rs`: SSE endpoints for streaming

**Frontend (React)**:
- `frontend/src/hooks/useTaskAttempts.ts`: Fetch and create attempts
- `frontend/src/hooks/useExecutionProcess.ts`: Subscribe to process events
- `frontend/src/hooks/useEventSourceManager.ts`: SSE connection management
- `frontend/src/components/tasks/TaskFollowUpSection.tsx`: Full agent UI

**Database Schema** (SQLite):
```sql
CREATE TABLE task_attempts (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    executor TEXT NOT NULL,
    base_branch TEXT,
    worktree_path TEXT,
    status TEXT NOT NULL,
    execution_process_id TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE execution_processes (
    id TEXT PRIMARY KEY,
    task_attempt_id TEXT,
    command TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (task_attempt_id) REFERENCES task_attempts(id)
);
```

## Proposed Manager Agent Architecture

### 1. New Database Model: ManagerExecution

```rust
// crates/db/src/models/manager_execution.rs

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "ts", derive(TS))]
pub struct ManagerExecution {
    pub id: Uuid,
    pub project_id: Uuid,           // ← Operates at project level
    pub executor: String,            // Same executors (CLAUDE_CODE, etc.)
    pub status: ManagerExecutionStatus,
    pub execution_process_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ManagerExecutionStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateManagerExecution {
    pub project_id: Uuid,
    pub executor: String,
    pub prompt: String,              // User's request (e.g., "Create auth tasks")
}
```

**Database Migration**:
```sql
-- crates/db/migrations/YYYYMMDDHHMMSS_add_manager_executions.sql

CREATE TABLE manager_executions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    executor TEXT NOT NULL,
    status TEXT NOT NULL,
    execution_process_id TEXT,
    prompt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (execution_process_id) REFERENCES execution_processes(id)
);

CREATE INDEX idx_manager_executions_project_id
    ON manager_executions(project_id);
CREATE INDEX idx_manager_executions_status
    ON manager_executions(status);
```

### 2. API Endpoints

```rust
// crates/server/src/routes/manager_executions.rs

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json, Router,
};
use uuid::Uuid;

// POST /api/manager-executions
// Create a new manager execution
async fn create_manager_execution(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateManagerExecution>,
) -> Result<impl IntoResponse, StatusCode> {
    let execution = ManagerExecution::create(&state.db, payload).await?;

    // Start executor process with MCP context
    let process = start_manager_executor(
        &state,
        &execution,
        payload.prompt,
    ).await?;

    // Link execution to process
    execution.update_process_id(&state.db, process.id).await?;

    Ok(Json(execution))
}

// GET /api/manager-executions/:id
// Get manager execution details
async fn get_manager_execution(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let execution = ManagerExecution::get(&state.db, id).await?;
    Ok(Json(execution))
}

// GET /api/projects/:project_id/manager-executions
// List manager executions for a project
async fn list_manager_executions(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let executions = ManagerExecution::list_by_project(&state.db, project_id).await?;
    Ok(Json(executions))
}

// POST /api/manager-executions/:id/cancel
// Cancel a running execution
async fn cancel_manager_execution(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    let execution = ManagerExecution::get(&state.db, id).await?;

    if let Some(process_id) = execution.execution_process_id {
        ExecutionProcess::cancel(&state.db, process_id).await?;
    }

    execution.update_status(&state.db, ManagerExecutionStatus::Cancelled).await?;
    Ok(StatusCode::OK)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/manager-executions", post(create_manager_execution))
        .route("/api/manager-executions/:id", get(get_manager_execution))
        .route("/api/projects/:project_id/manager-executions", get(list_manager_executions))
        .route("/api/manager-executions/:id/cancel", post(cancel_manager_execution))
}
```

### 3. Executor Integration

```rust
// crates/executors/src/manager_executor.rs

/// Start a manager executor process
/// Unlike task executors, this doesn't need a worktree
pub async fn start_manager_executor(
    state: &AppState,
    execution: &ManagerExecution,
    prompt: String,
) -> Result<ExecutionProcess> {
    let executor_config = state.executors.get(&execution.executor)?;

    // Build command with MCP context
    // Manager executors get project-level MCP tools:
    // - bulk_create_tasks
    // - list_tasks
    // - update_task
    // - etc.
    let command = build_manager_command(
        executor_config,
        &execution.project_id,
        &prompt,
    );

    // Start process (no worktree needed!)
    let process = ExecutionProcess::spawn(
        command,
        None, // ← No worktree_path
        execution.id,
    ).await?;

    Ok(process)
}

fn build_manager_command(
    executor: &ExecutorConfig,
    project_id: &Uuid,
    prompt: &str,
) -> Command {
    match executor.name.as_str() {
        "CLAUDE_CODE" => {
            // Run claude-code with MCP server configured
            // The MCP server provides project-level tools
            Command::new("claude-code")
                .arg("--mcp-server")
                .arg(format!("vibe-kanban-project-{}", project_id))
                .arg("--prompt")
                .arg(prompt)
                .build()
        }
        _ => unimplemented!("Executor not supported for manager: {}", executor.name),
    }
}
```

### 4. Frontend Component Abstraction

**Step 1**: Abstract TaskFollowUpSection to accept context

```tsx
// frontend/src/components/agent/AgentFollowUpSection.tsx
// (Renamed from TaskFollowUpSection)

type AgentContext =
  | { type: 'task'; taskId: string }
  | { type: 'manager'; projectId: string }

interface AgentFollowUpSectionProps {
  context: AgentContext;
}

export function AgentFollowUpSection({ context }: AgentFollowUpSectionProps) {
  // Branch logic based on context type
  if (context.type === 'task') {
    return <TaskAgentView taskId={context.taskId} />;
  } else {
    return <ManagerAgentView projectId={context.projectId} />;
  }
}

function TaskAgentView({ taskId }: { taskId: string }) {
  const { task } = useTask(taskId);
  const { taskAttempts } = useTaskAttempts(taskId);
  // ... existing task-level logic
}

function ManagerAgentView({ projectId }: { projectId: string }) {
  const { project } = useProject(projectId);
  const { managerExecutions } = useManagerExecutions(projectId);

  // Same UI structure, different data:
  return (
    <div>
      {/* Project context instead of task context */}
      <ProjectHeader project={project} />

      {/* Chat history: previous manager executions */}
      <ChatHistory executions={managerExecutions} />

      {/* Live logs: streaming from current execution */}
      <StreamingLogs
        logs={logs}
        status={status}
        type="manager" // ← Parse logs differently
      />

      {/* Input: same interface, different API */}
      <ChatInput
        onSend={handleManagerSend}
        onRetry={handleManagerRetry}
      />
    </div>
  );
}
```

**Step 2**: Create manager-specific hooks

```tsx
// frontend/src/hooks/useManagerExecutions.ts

export function useManagerExecutions(projectId: string) {
  const [executions, setExecutions] = useState<ManagerExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExecutions = async () => {
      const response = await fetch(
        `/api/projects/${projectId}/manager-executions`
      );
      const data = await response.json();
      setExecutions(data);
      setIsLoading(false);
    };

    fetchExecutions();
  }, [projectId]);

  const createExecution = async (prompt: string, executor: string) => {
    const response = await fetch('/api/manager-executions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        executor,
        prompt,
      }),
    });

    const newExecution = await response.json();
    setExecutions([newExecution, ...executions]);
    return newExecution;
  };

  return { executions, isLoading, createExecution };
}
```

### 5. Event Streaming Integration

Manager executions reuse the **same ExecutionProcess infrastructure**, so streaming "just works":

```tsx
// frontend/src/hooks/useManagerExecutionProcess.ts

export function useManagerExecutionProcess(processId: string | null) {
  // Same SSE subscription as task executions!
  const { logs, status } = useEventSourceManager(
    processId ? `/api/events/processes/${processId}/logs` : null
  );

  // Parse logs for manager-specific events
  const parsedLogs = useMemo(() => {
    return logs.map(log => {
      // Detect MCP tool calls in logs
      if (log.message.includes('bulk_create_tasks')) {
        return { ...log, type: 'mcp_tool_call' };
      }
      if (log.message.includes('✓ Created task:')) {
        return { ...log, type: 'task_created' };
      }
      return log;
    });
  }, [logs]);

  return { logs: parsedLogs, status };
}
```

**Key Insight**: Because both task and manager executions use `ExecutionProcess`, the entire streaming infrastructure (SSE, log buffering, reconnection logic) is **shared for free**.

### 6. Manager Agent Panel Integration

```tsx
// frontend/src/components/manager/ManagerAgentPanel.tsx
// (Updated to use new infrastructure)

import { AgentFollowUpSection } from '@/components/agent/AgentFollowUpSection';

export function ManagerAgentPanel({ projectId }: { projectId: string }) {
  // Simply pass manager context to shared component
  return (
    <AgentFollowUpSection
      context={{ type: 'manager', projectId }}
    />
  );
}
```

**Result**: All functionality (streaming logs, retries, approvals, image uploads, variant selection) now works for manager executions!

## Implementation Plan

### Phase 1: Database & Backend (2-3 hours)

1. **Create migration** (`YYYYMMDDHHMMSS_add_manager_executions.sql`)
   - `manager_executions` table
   - Indexes for performance
   - Run migration: `sqlx migrate run`
   - Update query cache: `cargo sqlx prepare --workspace`

2. **Create ManagerExecution model** (`crates/db/src/models/manager_execution.rs`)
   - Struct definitions
   - CRUD operations
   - Status transitions

3. **Create API routes** (`crates/server/src/routes/manager_executions.rs`)
   - POST /api/manager-executions
   - GET /api/manager-executions/:id
   - GET /api/projects/:project_id/manager-executions
   - POST /api/manager-executions/:id/cancel

4. **Wire up executor** (`crates/executors/src/manager_executor.rs`)
   - `start_manager_executor` function
   - MCP context configuration
   - Process spawning (no worktree)

5. **Test backend**:
   ```bash
   # Create execution
   curl -X POST http://localhost:4600/api/manager-executions \
     -H "Content-Type: application/json" \
     -d '{"project_id":"...","executor":"CLAUDE_CODE","prompt":"Create auth tasks"}'

   # Check logs
   curl http://localhost:4600/api/events/processes/{process_id}/logs
   ```

### Phase 2: Frontend Abstraction (3-4 hours)

1. **Rename component**:
   - `TaskFollowUpSection.tsx` → `AgentFollowUpSection.tsx`
   - Update imports across codebase

2. **Add context prop**:
   - Define `AgentContext` type
   - Branch UI based on context.type
   - Extract shared components (ChatInput, StreamingLogs)

3. **Create manager hooks**:
   - `useManagerExecutions.ts`
   - `useManagerExecutionProcess.ts`

4. **Update ManagerAgentPanel**:
   - Remove temporary implementation
   - Use `AgentFollowUpSection` with manager context

5. **Generate TypeScript types**:
   ```bash
   pnpm run generate-types
   ```

### Phase 3: Testing & Polish (1-2 hours)

1. **Integration testing**:
   - Create manager execution via UI
   - Verify logs stream correctly
   - Confirm tasks are created
   - Test retry/cancel functionality

2. **Error handling**:
   - Handle failed executions gracefully
   - Show errors in UI
   - Add retry mechanism

3. **UX improvements**:
   - Success feedback when tasks created
   - Link to created tasks
   - Execution history view

### Phase 4: Documentation (1 hour)

1. **Update MANAGER_AGENT.md**:
   - Add architecture section
   - Update examples with real execution flow

2. **Update README.md**:
   - Add manager execution API docs
   - Update MCP tools section

3. **Code comments**:
   - Document manager vs task differences
   - Explain context abstraction

## Key Design Decisions

### Why Not Build a Separate System?

**We considered**: Building a completely separate manager agent with its own UI, execution model, and streaming.

**We rejected it because**:
- Massive code duplication (600+ lines of TaskFollowUpSection logic)
- Users would get inconsistent UX between task and manager contexts
- Would miss future improvements to task agent (e.g., new executor features)
- Double the maintenance burden

**Instead**: Abstract the existing system to work in both contexts. This gives us:
- ✅ Unified UX (same interface for both)
- ✅ Code reuse (one component, two contexts)
- ✅ Future-proof (improvements benefit both)
- ✅ Less maintenance

### Why ManagerExecution Instead of TaskAttempt?

**We considered**: Reusing TaskAttempt for manager executions with a special "manager task".

**We rejected it because**:
- Semantic confusion (manager execution isn't a "task attempt")
- Forces worktree allocation (unnecessary overhead)
- Pollutes task queries with non-task data
- Makes database schema unclear

**Instead**: Separate `ManagerExecution` model that shares execution patterns but has project semantics.

### Why Reuse ExecutionProcess?

**ExecutionProcess is context-agnostic**. It tracks:
- Process lifecycle (spawning, stdout/stderr, exit status)
- Log streaming
- Status transitions

None of these concepts are task-specific, so we get to reuse **all of this infrastructure** for manager executions. This is the key architectural win.

## Risks & Mitigations

### Risk 1: Component Complexity

**Risk**: Abstracting TaskFollowUpSection might make it harder to understand/maintain.

**Mitigation**:
- Clear separation: TaskAgentView vs ManagerAgentView
- Shared components extracted (ChatInput, StreamingLogs)
- Comprehensive comments explaining context branching
- Type safety ensures correctness

### Risk 2: Database Schema Changes

**Risk**: Adding manager_executions table requires migration, could break existing deployments.

**Mitigation**:
- Non-breaking change (adds table, doesn't modify existing)
- Migration tested in dev environment first
- Include in PR with clear upgrade notes

### Risk 3: Executor Compatibility

**Risk**: Not all executors may work in manager context (some might expect worktrees).

**Mitigation**:
- Start with CLAUDE_CODE only (known to work with MCP)
- Add guard in executor selection ("Manager context only supports CLAUDE_CODE")
- Gradually test/enable other executors

### Risk 4: UI/UX Confusion

**Risk**: Users might not understand difference between task and manager agents.

**Mitigation**:
- Clear visual distinction (manager tray has different header)
- Contextual help text ("Manager Agent operates at project level...")
- Example prompts in placeholder text
- Documentation with use case examples

## Success Metrics

### Technical Success
- ✅ Manager executions stream logs correctly
- ✅ `bulk_create_tasks` MCP tool gets called by AI
- ✅ Tasks are created in database and visible in UI
- ✅ No regressions in task-level agent functionality
- ✅ All TypeScript compilation passes
- ✅ All Rust tests pass

### User Success
- ✅ Developer can describe a feature and get multiple tasks created
- ✅ Manager agent UI feels identical to task agent UI (streaming, retries, etc.)
- ✅ Execution history is visible and useful
- ✅ Error states are clear and actionable

## Future Enhancements

### 1. Multi-Turn Conversations
Currently, manager executions are one-shot ("create these tasks"). We could add:
- Follow-up questions from AI ("Which OAuth provider?")
- Iterative refinement ("Actually, split login into two tasks")
- Conversation history across executions

### 2. Smart Task Ordering
AI could add dependencies between created tasks:
- "Task B depends on Task A"
- Visualize dependency graph
- Suggest execution order

### 3. Task Templates
Manager agent could learn from patterns:
- "Last time I created auth tasks, I always need these 5"
- Template library
- Project-specific patterns

### 4. Bulk Task Operations
Beyond creation, manager agent could:
- Bulk update task statuses
- Reassign multiple tasks
- Batch delete completed tasks
- Reorganize backlog priorities

### 5. Integration with Project Planning Tools
- Import tasks from Jira, Linear, GitHub Issues
- Export created tasks to external systems
- Sync task status bidirectionally

## Conclusion

The Manager Agent extends Vibe Factory's AI capabilities from task-level (writing code) to project-level (planning work). By **reusing the existing task agent infrastructure** rather than building something separate, we achieve:

1. **Unified UX**: Developers get the same powerful interface (streaming logs, retries, approvals) in both contexts
2. **Code Reuse**: 600+ lines of TaskFollowUpSection logic work for both task and manager
3. **Rapid Implementation**: Most infrastructure already exists (ExecutionProcess, SSE streaming, MCP server)
4. **Future-Proof**: Improvements to task agent automatically benefit manager agent

**The key insight**: Task and manager agents are the same thing at different scopes. Both are AI agents that:
- Execute via a process
- Stream logs in real-time
- Can be retried/cancelled
- Have approval workflows

The only difference is **context**: tasks operate on code (need worktrees), managers operate on projects (create tasks). By abstracting this context, we get two powerful agents with one implementation.

**Next Steps**:
1. Review this architecture document
2. Approve implementation plan
3. Execute Phase 1-4 (estimated 7-10 hours total)
4. Ship to production
