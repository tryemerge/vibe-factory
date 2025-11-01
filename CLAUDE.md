# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prerequisites

Before starting development, ensure you have:
- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) >=18
- [pnpm](https://pnpm.io/) >=8

Install additional development tools:
```bash
cargo install cargo-watch
cargo install sqlx-cli
pnpm i
```

## Essential Commands

### Development
```bash
# Start development servers with hot reload (frontend + backend)
pnpm run dev

# Individual dev servers
pnpm run frontend:dev    # Frontend only (port 3000)
pnpm run backend:dev     # Backend only (port auto-assigned)

# Build production version
pnpm run build:npx       # Or: ./local-build.sh
```

### Testing & Validation
```bash
# Run all checks (frontend + backend)
pnpm run check

# Frontend specific
cd frontend && pnpm run lint          # Lint TypeScript/React code
cd frontend && pnpm run format:check  # Check formatting
cd frontend && pnpm run format        # Auto-fix formatting
cd frontend && pnpm exec tsc --noEmit # TypeScript type checking

# Backend specific  
cargo test --workspace               # Run all Rust tests
cargo test -p <crate_name>          # Test specific crate
cargo test test_name                # Run specific test
cargo fmt --all -- --check          # Check Rust formatting
cargo clippy --all --all-targets --all-features -- -D warnings  # Linting

# Type generation (after modifying Rust types)
pnpm run generate-types               # Regenerate TypeScript types from Rust
pnpm run generate-types:check        # Verify types are up to date
```

### Database Operations
```bash
# SQLx migrations
sqlx migrate run                     # Apply migrations
sqlx database create                 # Create database

# Database is auto-copied from dev_assets_template/ for worktrees
```

**IMPORTANT: Workflow for Database Schema Changes**

When creating or modifying database migrations, you **MUST** update the SQLx query cache to avoid compilation errors:

```bash
# 1. Create your migration file
touch crates/db/migrations/YYYYMMDDHHMMSS_description.sql
# Edit the migration file...

# 2. Apply migration to your local database
DATABASE_URL="sqlite:///Users/the_dusky/code/emerge/vibe-factory/dev_assets/db.sqlite" sqlx migrate run

# 3. Update SQLx offline query cache (CRITICAL!)
DATABASE_URL="sqlite:///Users/the_dusky/code/emerge/vibe-factory/dev_assets/db.sqlite" cargo sqlx prepare --workspace

# 4. Commit BOTH the migration AND the updated cache
git add crates/db/migrations/
git add .sqlx/
git commit -m "Add migration with updated query cache"
```

**Why this matters:**
- SQLx uses offline query cache (`.sqlx/` directory) for compile-time verification
- If you change the schema but don't update the cache, compilation will fail
- PRs with database changes MUST include updated `.sqlx/` files
- Use absolute paths for `DATABASE_URL` to avoid path resolution issues

## Architecture Overview

### Tech Stack
- **Backend**: Rust with Axum web framework, Tokio async runtime, SQLx for database
- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui components  
- **Database**: SQLite with SQLx migrations
- **Type Sharing**: ts-rs generates TypeScript types from Rust structs
- **MCP Server**: Built-in Model Context Protocol server for AI agent integration

### Project Structure
```
crates/
├── server/         # Axum HTTP server, API routes, MCP server
├── db/            # Database models, migrations, SQLx queries
├── executors/     # AI coding agent integrations (Claude, Gemini, etc.)
├── services/      # Business logic, GitHub, auth, git operations
├── local-deployment/  # Local deployment logic
└── utils/         # Shared utilities

frontend/          # React application
├── src/
│   ├── components/  # React components (TaskCard, ProjectCard, etc.)
│   ├── pages/      # Route pages
│   ├── hooks/      # Custom React hooks (useEventSourceManager, etc.)
│   └── lib/        # API client, utilities

shared/types.ts    # Auto-generated TypeScript types from Rust
```

### Key Architectural Patterns

1. **Event Streaming**: Server-Sent Events (SSE) for real-time updates
   - Process logs stream to frontend via `/api/events/processes/:id/logs`
   - Task diffs stream via `/api/events/task-attempts/:id/diff`

2. **Git Worktree Management**: Each task execution gets isolated git worktree
   - Managed by `WorktreeManager` service
   - Automatic cleanup of orphaned worktrees

3. **Executor Pattern**: Pluggable AI agent executors
   - Each executor (Claude, Gemini, etc.) implements common interface
   - Actions: `coding_agent_initial`, `coding_agent_follow_up`, `script`

4. **MCP Integration**: Vibe Kanban acts as MCP server
   - Tools: `list_projects`, `list_tasks`, `create_task`, `update_task`, etc.
   - AI agents can manage tasks via MCP protocol

### API Patterns

- REST endpoints under `/api/*`
- Frontend dev server proxies to backend (configured in vite.config.ts)
- Authentication via GitHub OAuth (device flow)
- All database queries in `crates/db/src/models/`

### Development Workflow

1. **Backend changes first**: When modifying both frontend and backend, start with backend
2. **Type generation**: Run `npm run generate-types` after modifying Rust types
3. **Database migrations**: Create in `crates/db/migrations/`, apply with `sqlx migrate run`
4. **Component patterns**: Follow existing patterns in `frontend/src/components/`

### Testing Strategy

- **Unit tests**: Colocated with code in each crate
- **Integration tests**: In `tests/` directory of relevant crates  
- **Frontend tests**: TypeScript compilation and linting only
- **CI/CD**: GitHub Actions workflow in `.github/workflows/test.yml`

### Environment Variables

Build-time (set when building):
- `GITHUB_CLIENT_ID`: GitHub OAuth app ID (default: Bloop AI's app)
- `POSTHOG_API_KEY`: Analytics key (optional)

Runtime:
- `BACKEND_PORT`: Backend server port (default: auto-assign)
- `FRONTEND_PORT`: Frontend dev port (default: 3000)
- `HOST`: Backend host (default: 127.0.0.1)
- `VIBE_WORKTREE_DIR`: Custom directory for git worktrees (default: platform-specific temp dir)
  - Supports absolute paths: `/custom/path/to/worktrees`
  - Supports tilde expansion: `~/my-worktrees`
  - Supports relative paths (resolved from current directory)
- `DISABLE_WORKTREE_ORPHAN_CLEANUP`: Debug flag for worktrees
- `GIT_SCAN_TIMEOUT_MS`: Git repository scan timeout (default: 5000ms)
- `GIT_SCAN_HARD_TIMEOUT_MS`: Git repository hard timeout (default: 10000ms)
- `GIT_SCAN_MAX_DEPTH`: Maximum directory depth for git scanning (default: 3)

## Dogfooding: Using Vibe-Factory to Develop Itself

When using vibe-factory to work on itself, each worktree needs an isolated environment to safely test changes without breaking the orchestration system.

### Project Configuration for Self-Development

**Copy Files:**
```
.env
```

**Setup Script:**
```bash
#!/bin/bash
set -e

# Install dependencies
pnpm install

# Copy template database (production snapshot)
mkdir -p dev_assets
cp dev_assets_template/db.sqlite dev_assets/db.sqlite
cp dev_assets_template/config.json dev_assets/config.json

# Run migrations on copied database
WORKTREE_DB="$(pwd)/dev_assets/db.sqlite"
cd crates/db && DATABASE_URL="sqlite://$WORKTREE_DB" sqlx migrate run && cd ../..

echo "✅ Worktree ready with isolated database"
```

**Dev Server Script** (optional, for testing backend changes):
```bash
#!/bin/bash
# Run isolated backend + frontend
BACKEND_PORT=0 pnpm run dev
```

### Database Template

- `dev_assets_template/` contains a snapshot of the production database
- This directory is version-controlled (unlike `dev_assets/`)
- Each worktree gets a fresh copy for isolated testing
- Update template when you want worktrees to have fresh production data:
  ```bash
  cp dev_assets/db.sqlite dev_assets_template/db.sqlite
  ```

### Why This Architecture?

- **Main instance** (port 3000/3001): Safe orchestrator, manages tasks, never crashes
- **Worktree instances** (auto-assigned ports): Isolated backends for testing changes
- **Template DB**: Realistic production data for each worktree without conflicts
- **Safe merges**: Schema changes tested in isolation before merging to master
