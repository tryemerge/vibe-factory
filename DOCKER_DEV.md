# Docker Development Environment

This guide explains how to use the Docker development environment for Vibe Kanban with hot-reload support.

## Prerequisites

- Docker Desktop or Docker Engine (with docker-compose)
- Git

## Quick Start

### Using docker-compose (Recommended)

1. **Start the development environment:**
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

2. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

3. **Make changes to code:**
   - Edit files in `crates/` (Rust backend) - `cargo-watch` will automatically rebuild
   - Edit files in `frontend/` (TypeScript/React) - Vite will hot-reload
   - Changes are immediately reflected in the running container

4. **Stop the environment:**
   ```bash
   docker-compose -f docker-compose.dev.yml down
   ```

### Using Docker directly

1. **Build the development image:**
   ```bash
   docker build -f Dockerfile.dev -t vibe-kanban-dev .
   ```

2. **Run the container:**
   ```bash
   docker run -it \
     -p 3000:3000 \
     -p 3001:3001 \
     -v "$(pwd)/crates:/app/crates" \
     -v "$(pwd)/frontend:/app/frontend" \
     -v "$(pwd)/npx-cli:/app/npx-cli" \
     -v "$(pwd)/scripts:/app/scripts" \
     -v "$(pwd)/shared:/app/shared" \
     -v "$(pwd)/Cargo.toml:/app/Cargo.toml" \
     -v "$(pwd)/Cargo.lock:/app/Cargo.lock" \
     -v "$(pwd)/package.json:/app/package.json" \
     -v "$(pwd)/pnpm-lock.yaml:/app/pnpm-lock.yaml" \
     -v "$(pwd)/pnpm-workspace.yaml:/app/pnpm-workspace.yaml" \
     -v "$(pwd)/dev_assets:/app/dev_assets" \
     --name vibe-kanban-dev \
     vibe-kanban-dev
   ```

## Features

### Hot-Reload Support

- **Backend (Rust)**: Uses `cargo-watch` to automatically rebuild and restart the server when Rust files change
- **Frontend (TypeScript/React)**: Uses Vite's built-in HMR (Hot Module Replacement) for instant updates

### Volume Mounts

The container mounts your local source code, so all changes are immediately visible:
- `crates/` - Rust backend code
- `frontend/` - React frontend code
- `npx-cli/` - CLI tool code
- `dev_assets/` - Database and assets (persisted)

### Build Cache

Docker volumes are used to persist build artifacts for faster rebuilds:
- `node_modules` - Node.js dependencies
- `cargo_target` - Rust build artifacts
- `cargo_registry` - Rust dependency cache

## Development Workflow

### Making Backend Changes

1. Edit files in `crates/` directory
2. `cargo-watch` detects changes and rebuilds automatically
3. Server restarts with new code
4. Test at http://localhost:3001

### Making Frontend Changes

1. Edit files in `frontend/` directory
2. Vite HMR updates browser instantly
3. No page reload needed (in most cases)
4. Test at http://localhost:3000

### Database Migrations

To run database migrations inside the container:

```bash
# Enter the container
docker exec -it vibe-kanban-dev sh

# Run migrations
sqlx migrate run
```

Or directly:
```bash
docker exec -it vibe-kanban-dev sqlx migrate run
```

### Running Tests

```bash
# Backend tests
docker exec -it vibe-kanban-dev cargo test --workspace

# Frontend tests
docker exec -it vibe-kanban-dev sh -c "cd frontend && pnpm run check"
```

### Viewing Logs

```bash
# All logs
docker-compose -f docker-compose.dev.yml logs -f

# Backend logs only
docker-compose -f docker-compose.dev.yml logs -f | grep cargo

# Frontend logs only
docker-compose -f docker-compose.dev.yml logs -f | grep vite
```

## VSCode Remote Development

### Using Dev Containers Extension

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

2. Create `.devcontainer/devcontainer.json`:
   ```json
   {
     "name": "Vibe Kanban Dev",
     "dockerComposeFile": "../docker-compose.dev.yml",
     "service": "vibe-kanban-dev",
     "workspaceFolder": "/app",
     "customizations": {
       "vscode": {
         "extensions": [
           "rust-lang.rust-analyzer",
           "dbaeumer.vscode-eslint",
           "esbenp.prettier-vscode"
         ]
       }
     },
     "forwardPorts": [3000, 3001]
   }
   ```

3. Open Command Palette (Cmd/Ctrl+Shift+P)
4. Select "Dev Containers: Reopen in Container"
5. VSCode will connect to the running container

### Manual Remote Connection

1. Start the container with docker-compose
2. Use VSCode's "Attach to Running Container" feature
3. Select `vibe-kanban-dev` container

## Troubleshooting

### Port Already in Use

If ports 3000 or 3001 are already in use, modify the port mappings in `docker-compose.dev.yml`:

```yaml
ports:
  - "4000:3000"  # Frontend now at http://localhost:4000
  - "4001:3001"  # Backend now at http://localhost:4001
```

### Slow Rebuilds

First run will be slow as it installs all dependencies. Subsequent runs are faster due to volume caching.

To reset build cache:
```bash
docker-compose -f docker-compose.dev.yml down -v
```

### Permission Issues

If you encounter permission issues with mounted volumes:

```bash
# Run container as your user
docker-compose -f docker-compose.dev.yml run --user $(id -u):$(id -g) vibe-kanban-dev
```

### Backend Not Reloading

If `cargo-watch` isn't detecting changes:

1. Check that the file is saved
2. Verify the file is in `crates/` directory
3. Check container logs: `docker-compose logs -f`

### Frontend Not Reloading

If Vite isn't hot-reloading:

1. Check browser console for errors
2. Try hard refresh (Cmd/Ctrl+Shift+R)
3. Verify Vite is running: `docker-compose logs -f | grep vite`

## Differences from Local Development

| Feature | Local Dev | Docker Dev |
|---------|-----------|------------|
| Port Configuration | Uses `.dev-ports.json` | Fixed ports (3000/3001) |
| Database Location | `dev_assets/db.sqlite` | Same (mounted volume) |
| Hot Reload | cargo-watch + Vite | Same |
| Dependencies | Local install | Inside container |
| Worktree Support | Full support | Limited (use local dev) |

## When to Use Docker Dev vs Local Dev

**Use Docker Dev:**
- Remote development on a server
- Consistent environment across team
- Testing deployment configuration
- Avoiding local dependency installation

**Use Local Dev:**
- Dogfooding (vibe-factory managing itself)
- Worktree isolation needed
- Best performance
- Full git integration

## Environment Variables

The following environment variables are set in the development container:

- `RUST_LOG=debug` - Enable debug logging
- `HOST=0.0.0.0` - Bind to all interfaces
- `FRONTEND_PORT=3000` - Frontend port
- `BACKEND_PORT=3001` - Backend port
- `DISABLE_WORKTREE_ORPHAN_CLEANUP=1` - Disable cleanup during dev

Override these in `docker-compose.dev.yml` as needed.

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [VSCode Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers)
- [cargo-watch Documentation](https://github.com/watchexec/cargo-watch)
- [Vite HMR Documentation](https://vitejs.dev/guide/features.html#hot-module-replacement)
