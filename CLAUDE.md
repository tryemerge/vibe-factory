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

### Database Safety & Backups

**🚨 CRITICAL: Production Database Protection**

The `dev_assets/db.sqlite` database in the main repository contains production data (tasks, agents, projects). Multiple safety mechanisms prevent accidental overwrites:

**1. Automated Backups (STRONGLY RECOMMENDED)**

```bash
# Set up hourly automated backups
./scripts/setup-backup-cron.sh

# Manual backup
./scripts/backup-database.sh
```

Backups are stored in `dev_assets/backups/` with timestamps. Last 10 backups are kept automatically.

**2. Worktree Setup Script Protection**

The `scripts/setup-worktree.sh` script has multiple safeguards:

- ✅ **Prevents running in main repository** - Detects `.git` directory and aborts
- ✅ **Database size check** - Won't overwrite databases >4MB
- ✅ **Worktree marker file** - Uses `.worktree_initialized` to track state
- ✅ **Explicit warnings** - Shows clear error messages if safety checks fail

**⚠️ NEVER run setup-worktree.sh in the main repository!**

**3. Manual Recovery**

If database is accidentally overwritten:

```bash
# 1. Check backups
ls -lh dev_assets/backups/

# 2. Restore latest backup
cp dev_assets/backups/db_backup_YYYYMMDD_HHMMSS.sqlite dev_assets/db.sqlite

# 3. Verify restoration
sqlite3 dev_assets/db.sqlite "SELECT COUNT(*) FROM tasks"
```

**4. Database Safety Checklist**

Before running ANY script that touches `dev_assets/`:

- [ ] Check you're in the right directory (main repo vs worktree)
- [ ] Verify current database size: `ls -lh dev_assets/db.sqlite`
- [ ] Create manual backup: `./scripts/backup-database.sh`
- [ ] Review script code before running

**5. Worktree vs Main Repository**

| Location | Database | Purpose | Can Overwrite? |
|----------|----------|---------|----------------|
| Main repo (`vibe-factory/`) | `dev_assets/db.sqlite` | **Production data** | ❌ NEVER |
| Worktree (`vibe-factory-worktrees/*/`) | `dev_assets/db.sqlite` | Isolated testing | ✅ Yes (safe) |

**Main repo indicators:**
- `.git` is a **directory**
- Fixed ports: 3401 (frontend), 3501 (backend)
- Large database (>4MB with real tasks)

**Worktree indicators:**
- `.git` is a **file** (points to main repo)
- Dynamic ports: 4500+, 4600+
- Fresh database (copied from template)

## PR Merge Workflow

**🚨 CRITICAL: Safe PR Integration to Prevent System Downtime**

To prevent system crashes when merging PRs (especially those with database migrations), follow this two-step process:

### Step 1: Pre-Merge Validation (Run in Worktree)

**Before merging any PR**, run the validation script in the PR's worktree:

```bash
# In the PR worktree (e.g., vibe-factory-worktrees/xxxx-task-name/)
./scripts/validate-pr-for-merge.sh
```

This script validates:
- ✅ Running in a worktree (not main repo)
- ✅ All migrations are applied to worktree database
- ✅ SQLx query cache (`.sqlx/`) is updated with correct checksums
- ✅ All tests pass (`pnpm run check`)
- ✅ Code builds successfully
- ✅ Server starts without errors

**If validation fails:** Fix the issues in the worktree before merging.

**Common fixes:**
```bash
# Apply migrations
WORKTREE_DB="$(pwd)/dev_assets/db.sqlite"
DATABASE_URL="sqlite://$WORKTREE_DB" sqlx migrate run

# Update SQLx cache (CRITICAL for migrations!)
DATABASE_URL="sqlite://$WORKTREE_DB" cargo sqlx prepare --workspace

# Commit the .sqlx/ changes
git add .sqlx/
git commit -m "Update SQLx query cache for migrations"
```

### Step 2: Post-Merge Integration (Run in Main Repo)

**After merging a PR**, run the integration script in the main repository:

```bash
# In main repo (vibe-factory/)
./scripts/post-merge-integration.sh
```

This script:
1. ✅ Creates pre-integration backup
2. ✅ Pulls latest changes from remote
3. ✅ Detects new migrations
4. ✅ Stops running dev servers
5. ✅ Applies migrations to production database
6. ✅ Regenerates SQLx query cache with correct checksums
7. ✅ Installs any new dependencies
8. ✅ Tests server startup (verifies no crashes)
9. ✅ Creates post-integration backup

**If integration fails:** The script will show the error and preserve the pre-integration backup for recovery.

### Quick Reference: Complete PR Workflow

```bash
# 1. Develop in worktree
cd vibe-factory-worktrees/xxxx-task-name/
# ... make changes, create migrations, etc ...

# 2. Update SQLx cache if you have migrations
DATABASE_URL="sqlite://$(pwd)/dev_assets/db.sqlite" cargo sqlx prepare --workspace
git add .sqlx/
git commit -m "Update SQLx cache"

# 3. Validate before merging
./scripts/validate-pr-for-merge.sh

# 4. Merge PR via GitHub
gh pr merge --squash

# 5. Integrate into main repo
cd ~/code/emerge/vibe-factory  # Main repo
./scripts/post-merge-integration.sh

# 6. Start dev servers
pnpm run dev
```

### Why This Prevents System Downtime

**Problem we're solving:**
- Merging a PR with migrations can cause the main repo server to crash if:
  - Migration checksums don't match (SQLx validation fails)
  - Migrations weren't applied to production database
  - SQLx cache wasn't regenerated with new schema

**How these scripts prevent it:**
- **Pre-merge validation** catches issues before they reach main repo
- **Post-merge integration** safely applies changes with automated backups
- **Server startup testing** verifies system health before resuming work
- **Automatic backups** enable quick recovery if something goes wrong

### Manual PR Merge (Without Scripts)

If you need to merge manually without the scripts:

**Checklist:**
- [ ] Verify all migrations are in `crates/db/migrations/`
- [ ] Apply migrations: `DATABASE_URL="sqlite://$(pwd)/dev_assets/db.sqlite" sqlx migrate run`
- [ ] Update cache: `DATABASE_URL="sqlite://$(pwd)/dev_assets/db.sqlite" cargo sqlx prepare --workspace`
- [ ] Commit `.sqlx/` changes
- [ ] Run `pnpm run check` to verify tests pass
- [ ] Test server startup: `cargo run --bin server`
- [ ] Create backup: `./scripts/backup-database.sh`
- [ ] Merge PR
- [ ] In main repo: `git pull`
- [ ] In main repo: Apply migrations again
- [ ] In main repo: Regenerate SQLx cache
- [ ] In main repo: Test server startup
- [ ] In main repo: Create backup

### Migration Checksum Issues

If you encounter `VersionMismatch` errors after merging:

**Symptoms:**
```
Error: Deployment(Sqlx(Migrate(VersionMismatch(YYYYMMDDHHMMSS))))
```

**Diagnosis:**
```bash
# Check what SQLx expects
shasum -a 384 crates/db/migrations/YYYYMMDDHHMMSS_*.sql

# Check what's in database
sqlite3 dev_assets/db.sqlite "SELECT version, hex(checksum), length(checksum) FROM _sqlx_migrations WHERE version = YYYYMMDDHHMMSS;"
```

**Fix:**
```bash
# Regenerate cache with correct checksums
DATABASE_URL="sqlite://$(pwd)/dev_assets/db.sqlite" cargo sqlx prepare --workspace

# Or manually update database checksum (advanced)
CHECKSUM=$(shasum -a 384 crates/db/migrations/YYYYMMDDHHMMSS_*.sql | awk '{print $1}')
sqlite3 dev_assets/db.sqlite "UPDATE _sqlx_migrations SET checksum = X'$CHECKSUM' WHERE version = YYYYMMDDHHMMSS;"
```

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

5. **Workflow Execution**: Multi-stage AI agent pipelines with conditional branching
   - **Workflows**: Directed graphs of stations (processing stages) and transitions (conditional routing)
   - **Stations**: Individual processing stages with assigned agents, prompts, and expected outputs
   - **Transitions**: Conditional rules determining the next station based on current station's result
   - **Context Accumulation**: Outputs from completed stations are merged and passed to subsequent stations
   - **Execution Tracking**: Full audit trail of workflow runs, station executions, and outputs
   - **Recovery**: Checkpoints enable resumption from failures, station-level retry without full workflow restart
   - See `docs/features/workflow-execution.md` for comprehensive documentation

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

### 🚨 CRITICAL: Worktree Port Allocation

**Main Instance:**
- Frontend: `http://localhost:3401`
- Backend: `http://localhost:3501`
- Database: `dev_assets/db.sqlite`

**Worktree Instances (DIFFERENT PORTS):**
- Frontend: `http://localhost:4500+` (auto-assigned)
- Backend: `http://localhost:4600+` (auto-assigned)
- Database: `worktree_path/dev_assets/db.sqlite` (isolated copy)

Each worktree gets **dedicated ports** to prevent conflicts. The ports are automatically allocated and saved in `.dev-ports.json`.

### Project Configuration for Self-Development

**Copy Files:**
```
.env
CLAUDE.md
AGENTS.md
```

**Setup Script:** (runs once when worktree is created)
```bash
./scripts/setup-worktree.sh
```

This script will:
1. Install dependencies (`pnpm install`)
2. Allocate dedicated ports (4500+/4600+ range)
3. Copy template database to `dev_assets/`
4. Run database migrations
5. Create `.env` with port configuration
6. Generate `README_WORKTREE.md` with your specific ports

**Dev Server Script:** (optional, auto-starts dev server for agent testing)
```bash
pnpm run dev
```

When configured in the vibe-factory project:
- Dev server starts automatically in background after setup
- Logs stream to vibe-factory UI in real-time
- Agent can test changes immediately at the allocated port
- Example: Agent says "check http://localhost:4500" (reads from .env)

**IMPORTANT:** After running the setup script, you MUST read the generated files to know your ports:

```bash
# Check your allocated ports
cat .dev-ports.json

# Read the full worktree documentation
cat README_WORKTREE.md
```

### Starting Development in a Worktree

**DO THIS:**
```bash
# 1. Run setup first (only needed once)
./scripts/setup-worktree.sh

# 2. Check your ports
cat .dev-ports.json

# 3. Start servers (uses ports from .env automatically)
pnpm run dev

# Frontend will be on the port shown in .dev-ports.json
# Example: http://localhost:4502
```

**DON'T DO THIS:**
```bash
# ❌ Don't manually specify ports
npm run frontend:dev -- --port 3000  # WRONG - conflicts with main

# ❌ Don't assume port 3000
# Your worktree uses different ports!

# ❌ Don't skip the setup script
pnpm run dev  # WRONG - won't have ports configured
```

### Database Template

- `dev_assets_template/` contains a snapshot of the production database
- This directory is version-controlled (unlike `dev_assets/`)
- Each worktree gets a fresh copy for isolated testing
- Update template when you want worktrees to have fresh production data:
  ```bash
  cp dev_assets/db.sqlite dev_assets_template/db.sqlite
  ```

### Port Allocation Details

Ports are allocated using `scripts/worktree-dev-ports.js`:
- Finds first available port starting from 4500 for frontend
- Finds first available port starting from 4600 for backend
- Saves to `.dev-ports.json` in the worktree
- Written to `.env` for automatic pickup by `pnpm run dev`

**File locations in worktree:**
```
.dev-ports.json          # Port allocation (JSON)
.env                     # Environment variables (includes FRONTEND_PORT, BACKEND_PORT)
README_WORKTREE.md       # Personalized setup guide
dev_assets/db.sqlite     # Isolated database
```

### Why This Architecture?

- **Main instance** (port 3401/3501): Safe orchestrator, manages tasks, never crashes
- **Worktree instances** (port 4500+/4600+): Isolated backends for testing changes, no port conflicts
- **Template DB**: Realistic production data for each worktree without conflicts
- **Safe merges**: Schema changes tested in isolation before merging to master
- **No manual port management**: Setup script handles everything

### Troubleshooting Worktree Issues

**Problem: "Backend not responding" or "Can't connect to server"**
- Solution: Check `.dev-ports.json` for your actual ports
- Your frontend is trying to connect to the wrong backend port
- Run `cat .dev-ports.json` to see the correct ports

**Problem: "Port already in use"**
- Solution: Main repo uses 3401/3501, worktrees use 4500+/4600+ range
- If there's a conflict, check what's running on your ports

**Problem: "Database not found"**
- Solution: Run `./scripts/setup-worktree.sh` to copy template DB

**Problem: "Don't know what ports to use"**
- Solution: Read `README_WORKTREE.md` or `cat .dev-ports.json`
