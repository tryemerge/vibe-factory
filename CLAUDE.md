# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mission Control is an orchestration and visualization tool for multiple coding agents. It's a full-stack application with a Rust backend (Axum) and React frontend that manages task execution through different coding agents like Claude and Amp.

## Commands

### Development
- `npm run dev` - Start full development environment (backend + frontend concurrently)
- `npm run frontend:dev` - Start frontend only (Vite dev server on port 3000)
- `npm run backend:dev` - Start backend only with hot reload (cargo-watch on port 3001)
- `npm run backend:run` - Run backend without hot reload

### Building & Testing
- `npm run build` - Build both frontend and backend for production
- `npm run frontend:build` - Build frontend only
- `npm run backend:build` - Build backend only
- `npm run backend:test` - Run backend tests
- `cd frontend && npm run lint` - Run ESLint on frontend
- `cd frontend && npm run lint:fix` - Fix ESLint issues automatically
- `cd frontend && npm run format` - Format frontend code with Prettier
- `cargo check --manifest-path backend/Cargo.toml` - Check backend compilation
- `cargo fmt --manifest-path backend/Cargo.toml` - Format Rust code

### Database & Types
- `npm run prepare-db` - Prepare database and solve SQLX macro compilation issues
- `npm run generate-types` - Regenerate TypeScript types from Rust structs

## Architecture

### High-Level Structure
- **Backend (Rust/Axum)**: REST API server on port 3001 (dev) or random port (prod)
- **Frontend (React/TypeScript)**: Vite-served SPA on port 3000, proxies `/api/*` to backend
- **Database**: SQLite with SQLx for migrations and queries
- **Shared Types**: Auto-generated TypeScript types from Rust using ts-rs

### Key Components

#### Backend Architecture
- **Executors**: Pluggable coding agents (Claude, Amp, Echo) implementing the `Executor` trait
- **Execution Monitor**: Background task that monitors running processes and handles completion
- **App State**: Global state management for running executions and configuration
- **Models**: Database models using SQLx with getter/setter patterns
- **Worktrees**: Git worktrees for isolated task execution environments

#### Execution Flow
1. Task created with chosen executor type
2. Git worktree created for isolation
3. Setup script runs (if configured)
4. Coding agent executor spawns and streams output to database
5. Execution monitor handles completion, commits changes, sends notifications
6. Task status updated to InReview for human review

#### Frontend Architecture
- **React Router**: Client-side routing with project/task hierarchical URLs
- **shadcn/ui**: Component library with Tailwind CSS
- **Config Provider**: Global configuration context
- **Theme Provider**: Dark/light theme support
- **Kanban Board**: Primary interface for task management

### Database Schema
- **projects**: Git repository configurations with setup/dev scripts
- **tasks**: Work items with title, description, status (todo/inprogress/inreview/done/cancelled)
- **task_attempts**: Execution attempts with worktree paths and merge commits
- **execution_processes**: Individual process executions (setup/coding agent/dev server)
- **task_attempt_activities**: Status change log with timestamps
- **executor_sessions**: Session tracking for coding agents

### Shared Types System
- Rust structs derive `TS` trait from ts-rs
- `backend/src/bin/generate_types.rs` generates `shared/types.ts`
- Never manually edit `shared/types.ts`
- When changing backend types, run `npm run generate-types`

## Development Workflow

### Working on Backend + Frontend
1. Start with backend changes first
2. If shared types change, run `npm run generate-types`
3. Then make frontend changes
4. Test with `npm run build` to verify TypeScript compilation

### Adding New Executors
1. Create new executor in `backend/src/executors/`
2. Implement `Executor` trait with `spawn()` method
3. Add to `ExecutorConfig` enum in `executor.rs`
4. Update frontend executor selection UI
5. Run `npm run generate-types` to sync types

### Database Changes
1. Create new migration in `backend/migrations/`
2. Update corresponding model in `backend/src/models/`
3. Run `npm run prepare-db` to apply migrations
4. Use SQLx queries in model methods, avoid raw SQL in routes

### Adding shadcn/ui Components
```bash
cd frontend
npx shadcn-ui@latest add [component-name]
```

## Configuration

- Backend config stored in user's config directory (`~/.config/mission-control/config.json`)
- Supports executor selection, editor integration, sound alerts, push notifications
- Frontend reads config via `/api/config` endpoint

## File Locations

- Backend source: `backend/src/`
- Frontend source: `frontend/src/`
- Shared types: `shared/types.ts` (auto-generated)
- Database migrations: `backend/migrations/`
- Sounds: `backend/sounds/`