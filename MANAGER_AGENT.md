# Manager Agent Guide

The Manager Agent is a project-level AI assistant that helps automate project management tasks in Vibe Factory. Unlike task-level agents that work on individual coding tasks, the Manager Agent helps with higher-order orchestration like creating tasks, organizing backlogs, and planning work.

## What is the Manager Agent?

The Manager Agent is an AI assistant (like Claude Code) that uses the Vibe Kanban MCP server to:
- Create multiple related tasks at once
- Break down large features into subtasks
- Organize and prioritize work
- Analyze project backlogs
- Suggest next steps

## Use Cases

### 1. Breaking Down Features into Tasks
Instead of manually creating multiple related tasks, ask the Manager Agent:

```
"Create tasks for implementing a new authentication system with OAuth,
including: setting up the OAuth provider, creating login/logout endpoints,
adding session management, and writing tests"
```

The Manager Agent will use `bulk_create_tasks` to create all tasks at once.

### 2. Analyzing Current Work
```
"What should I work on next for the vibe-factory project?"
```

The agent will use `list_tasks` to analyze your backlog and suggest priorities.

### 3. Creating This Very Task
This task was created as an example of what the Manager Agent should do:

```
"Add a manager project agent. The purpose is to have an agent that can help
create tasks and do other things currently done manually. Include creating
an MCP interface and documentation."
```

## Available MCP Tools

The Manager Agent has access to these MCP tools via the Vibe Kanban MCP server:

### Core Task Management
- `list_projects` - List all available projects
- `list_tasks` - List tasks in a project (with filtering)
- `get_task` - Get detailed information about a specific task
- `create_task` - Create a single task
- `bulk_create_tasks` - **NEW** - Create multiple tasks at once
- `update_task` - Update task title, description, or status
- `delete_task` - Delete a task
- `start_task_attempt` - Start an execution attempt for a task

### Manager-Specific Tool: `bulk_create_tasks`

**Purpose**: Efficiently create multiple related tasks in one operation.

**Parameters**:
```typescript
{
  project_id: string,  // Required: UUID of the project
  tasks: [
    {
      title: string,       // Required: Task title
      description?: string // Optional: Task description
    }
  ]
}
```

**Example**:
```json
{
  "project_id": "123e4567-e89b-12d3-a456-426614174000",
  "tasks": [
    {
      "title": "Setup OAuth provider configuration",
      "description": "Configure GitHub OAuth app credentials and callback URLs"
    },
    {
      "title": "Implement login endpoint",
      "description": "Create /api/auth/login endpoint with OAuth flow"
    },
    {
      "title": "Implement logout endpoint",
      "description": "Create /api/auth/logout endpoint and session cleanup"
    },
    {
      "title": "Add session management middleware",
      "description": "Implement session validation and token refresh"
    },
    {
      "title": "Write authentication tests",
      "description": "Add integration tests for OAuth flow and session management"
    }
  ]
}
```

**Response**:
```json
{
  "created_tasks": [
    {
      "task_id": "abc-123",
      "title": "Setup OAuth provider configuration"
    },
    {
      "task_id": "def-456",
      "title": "Implement login endpoint"
    }
    // ... etc
  ],
  "count": 5
}
```

## How to Use the Manager Agent

### Option 1: Using Claude Code with MCP

1. Ensure the Vibe Kanban MCP server is configured in your Claude Code settings
2. Get the project ID you want to work with:
   ```
   Use the vibe_kanban MCP server to list projects
   ```
3. Ask the Manager Agent to perform project-level tasks:
   ```
   "Using the vibe_kanban MCP server, create tasks for implementing feature X
   in project <project_id>"
   ```

### Option 2: Direct MCP Client

If you're using the MCP protocol directly:

```bash
# The MCP server binary
cargo build --release --bin mcp_task_server

# Set backend URL
export VIBE_BACKEND_URL=http://127.0.0.1:3001

# Run the MCP server
./target/release/mcp_task_server
```

### Option 3: Future UI (Planned)

A dedicated Manager Agent UI will be added in a future update, providing:
- Chat interface for natural language project management
- Visual task breakdown and organization
- Backlog analysis and recommendations
- One-click task creation from conversations

## Best Practices

### 1. Be Specific in Task Descriptions
When asking the Manager Agent to create tasks, include:
- Clear deliverables
- Acceptance criteria
- Technical context or constraints

**Good**:
```
"Create tasks for adding Redis caching: 1) Set up Redis connection with
health checks, 2) Add caching middleware for API routes, 3) Implement
cache invalidation strategy, 4) Add Redis integration tests"
```

**Less Good**:
```
"Add caching"
```

### 2. Review Generated Tasks
After the Manager Agent creates tasks, review them for:
- Completeness
- Appropriate scope (not too large or too small)
- Correct prioritization
- Missing dependencies

### 3. Use for Repetitive Workflows
The Manager Agent excels at:
- Creating standard task sets (e.g., "feature + tests + docs")
- Following project conventions
- Maintaining consistent task structure

### 4. Combine with Task-Level Agents
Workflow:
1. Manager Agent: Create and organize tasks
2. Task-Level Agent: Execute individual tasks
3. Manager Agent: Analyze results and create follow-up tasks

## Examples

### Example 1: Feature Breakdown
```
User: "Create tasks for adding WebSocket support to the backend"

Manager Agent:
- Uses `list_projects` to find the project
- Uses `bulk_create_tasks` to create:
  1. "Add WebSocket dependencies to Cargo.toml"
  2. "Implement WebSocket connection handler"
  3. "Add WebSocket authentication middleware"
  4. "Create WebSocket message routing"
  5. "Add WebSocket client for frontend"
  6. "Write WebSocket integration tests"
  7. "Update documentation with WebSocket usage"
```

### Example 2: Backlog Analysis
```
User: "What should I focus on for the vibe-factory project?"

Manager Agent:
- Uses `list_projects` to find vibe-factory
- Uses `list_tasks` with status="todo"
- Analyzes task descriptions and dependencies
- Responds: "I recommend starting with task ABC-123 (database migration)
  because 3 other tasks depend on it, then moving to XYZ-789 (API endpoint)
  which is blocking the frontend work"
```

### Example 3: Creating This Task
```
User: "Add a manager project agent that can help create tasks and automate
things developers currently do manually"

Manager Agent:
- Uses `create_task` to create the task with detailed description:
  Title: "Add a manager project Agent"
  Description: "Create a project-level AI agent that can:
  - Help create tasks automatically
  - Provide an MCP interface for project management
  - Offer a UI/UX for top-level project operations

  Example use case: Creating this very task should be possible through
  the manager agent instead of manual creation."
```

## Troubleshooting

### "Failed to connect to VK API"
- Ensure the Vibe Factory backend is running
- Check `VIBE_BACKEND_URL` environment variable
- Verify the backend port (default: auto-assigned, check port file)

### "project_id is required"
- All project-level operations need a project ID
- Use `list_projects` to get available project IDs
- Project IDs are UUIDs (e.g., `123e4567-e89b-12d3-a456-426614174000`)

### "Invalid status filter"
Valid task statuses: `todo`, `inprogress`, `inreview`, `done`, `cancelled`

## Future Enhancements

Planned features for the Manager Agent:

1. **Smart Task Breakdown**
   - AI-powered analysis of feature requirements
   - Automatic dependency detection
   - Estimated complexity and time

2. **Backlog Optimization**
   - Priority recommendations based on dependencies
   - Identification of bottlenecks
   - Workload balancing across team members

3. **Interactive UI**
   - Chat-based interface in the Vibe Factory frontend
   - Visual task organization (drag-and-drop)
   - Real-time collaboration with agents

4. **Project Templates**
   - Pre-defined task sets for common workflows
   - Customizable project templates
   - Best practices enforcement

5. **Analytics and Insights**
   - Project velocity tracking
   - Task completion patterns
   - Bottleneck identification
   - Resource allocation suggestions

## Technical Architecture

### MCP Server Location
- Implementation: `crates/server/src/mcp/task_server.rs`
- Binary: `crates/server/src/bin/mcp_task_server.rs`
- Protocol: MCP (Model Context Protocol)
- Transport: stdio

### New Tool: bulk_create_tasks
- Request structs: `BulkCreateTasksRequest`, `TaskInput`
- Response structs: `BulkCreateTasksResponse`, `CreatedTask`
- Implementation: Iterates over task list, creates each via `/api/tasks`
- Validation: Ensures at least one task is provided

### Integration Points
- Backend API: Uses existing `/api/tasks` endpoints
- Database: Leverages existing task models in `crates/db`
- Authentication: Inherits from backend API (GitHub OAuth)

## Contributing

To add new Manager Agent capabilities:

1. **Add MCP Tool**: Edit `crates/server/src/mcp/task_server.rs`
   - Add request/response structs with `schemars::JsonSchema`
   - Implement tool method with `#[tool]` attribute
   - Update `ServerInfo::instructions` to document the tool

2. **Update Backend API**: If needed, add endpoints in `crates/server/src/routes/`

3. **Update This Documentation**: Add examples and use cases

4. **Test**: Verify with Claude Code MCP integration

## Related Documentation

- [CLAUDE.md](./CLAUDE.md) - Main project documentation
- [MCP Protocol](https://modelcontextprotocol.io/) - MCP specification
- [Executor Pattern](./crates/executors/README.md) - Task-level agents

---

**Last Updated**: 2025-01-01
**Version**: 1.0.0
