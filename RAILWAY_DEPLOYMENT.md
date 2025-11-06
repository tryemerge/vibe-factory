# Railway Deployment Guide

## Overview

Vibe Kanban is configured for deployment on Railway using the existing Dockerfile. This guide covers deployment configuration, resource requirements, and troubleshooting.

## Configuration Files

### `railway.toml`

The project includes a `railway.toml` configuration file:

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "server"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
healthcheckPath = "/"
healthcheckTimeout = 300
```

This configuration:
- Uses the existing `Dockerfile` for builds
- Starts the `server` binary directly
- Automatically restarts on failure (up to 10 retries)
- Checks health via the root endpoint
- Allows 5 minutes for startup (Railway default is 300 seconds)

### `Dockerfile` Features

The existing Dockerfile is Railway-ready:

**Build stage** (Node 24 Alpine):
- Installs Rust, Node.js, and build dependencies
- Builds frontend assets with Vite
- Compiles Rust backend with embedded frontend assets
- Multi-stage build reduces final image size

**Runtime stage** (Alpine Linux):
- Minimal runtime dependencies (ca-certificates, tini, libgcc, wget)
- Non-root user (`appuser`) for security
- Health check configured
- `/repos` directory for git worktrees

## Port Configuration

The backend automatically reads the `PORT` environment variable set by Railway:

```rust
// crates/server/src/main.rs:70-82
let port = std::env::var("BACKEND_PORT")
    .or_else(|_| std::env::var("PORT"))  // Railway sets PORT
    .ok()
    .and_then(|s| s.trim().parse::<u16>().ok())
    .unwrap_or_else(|| {
        tracing::info!("No PORT environment variable set, using port 0 for auto-assignment");
        0
    });
```

Railway automatically sets `PORT` environment variable. The backend also supports `BACKEND_PORT` for local development.

## Environment Variables

### Required Variables

None! The application works with defaults.

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (automatically set by Railway) |
| `HOST` | `0.0.0.0` | Bind address (already configured in Dockerfile) |
| `RUST_LOG` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `VIBE_WORKTREE_DIR` | Platform temp | Custom directory for git worktrees |
| `GIT_SCAN_TIMEOUT_MS` | `5000` | Git repository scan timeout |
| `GIT_SCAN_MAX_DEPTH` | `3` | Maximum directory depth for git scanning |

### Build-time Variables

These must be set in Railway's environment variables **before building**:

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_CLIENT_ID` | `Ov23li9bxz3kKfPOIsGm` | GitHub OAuth app ID |
| `POSTHOG_API_KEY` | Empty | PostHog analytics key |
| `POSTHOG_API_ENDPOINT` | Empty | PostHog analytics endpoint |

## Resource Requirements

### Minimum Requirements

Based on the application architecture:

- **Memory**: 512 MB minimum, **1 GB recommended**
  - Rust backend: ~100-200 MB
  - Frontend assets embedded in binary: ~50 MB
  - Git operations and worktrees: ~200-500 MB
  - SQLite database: ~50-100 MB

- **CPU**: 0.5 vCPU minimum, **1 vCPU recommended**
  - Git operations are CPU-intensive
  - Multiple concurrent task executions benefit from more CPU

- **Storage**:
  - Container: ~500 MB (Alpine + compiled binary)
  - `/repos` volume: 1-10 GB depending on repository sizes and concurrent tasks
  - SQLite database: 100 MB - 1 GB

### Railway Plans

- **Free Tier** (Hobby): Likely insufficient for production
  - $5/month worth of usage
  - Limited memory and CPU
  - May work for testing/demo purposes

- **Pro Tier**: Recommended minimum
  - Starting at $20/month
  - Sufficient resources for moderate usage
  - Better uptime guarantees

## Deployment Steps

### 1. Connect Repository

1. Log in to Railway
2. Create new project → "Deploy from GitHub repo"
3. Select your Vibe Kanban repository
4. Railway auto-detects the Dockerfile

### 2. Configure Environment (Optional)

If using custom GitHub OAuth app:

1. Go to project → Variables
2. Add `GITHUB_CLIENT_ID` with your GitHub app client ID
3. Redeploy to rebuild with new client ID

### 3. Deploy

Railway automatically:
1. Detects `railway.toml` or Dockerfile
2. Builds the Docker image
3. Deploys to a unique URL (`*.railway.app`)
4. Sets PORT environment variable
5. Routes traffic when health check passes

### 4. Monitor Deployment

Check logs for:
- ✅ `Server running on http://0.0.0.0:<PORT>`
- ✅ Health check responding at `/`
- ⚠️ Any git or database initialization errors

## Known Limitations & Notes

### 1. Frontend Build Errors

**Current Status**: Pre-existing TypeScript compilation errors in the codebase prevent Docker builds from completing:

```
src/hooks/useWorkflowStations.ts(65,9): error TS2322: Type 'number | null' is not assignable to type 'number'.
src/pages/factory-floor.tsx(192,9): error TS2322: Type 'number' is not assignable to type 'bigint'.
src/pages/station-demo.tsx: Multiple 'onConfigure' property errors
```

**Resolution**: These errors exist on the `master` branch and need to be fixed before Railway deployment is possible. The Railway configuration itself is correct.

**Fixed in this PR**:
- ✅ Added missing `ContextFile` type export
- ✅ Regenerated TypeScript types

**Still TODO**:
- ❌ Fix workflow station type errors
- ❌ Fix factory floor type errors
- ❌ Fix station demo type errors

### 2. Git Worktrees

The application creates git worktrees in `/repos` directory for isolated task execution. On Railway:

- `/repos` is ephemeral (resets on deploy)
- Use `VIBE_WORKTREE_DIR` to persist to a mounted volume if needed
- Consider cleanup strategy for long-running deployments

### 3. Database

- Application uses SQLite by default
- Database file location: `dev_assets/db.sqlite`
- Railway's ephemeral filesystem means database resets on deploy
- For production: Consider mounting a volume or using Railway's PostgreSQL addon with migrations

### 4. Authentication

- Default GitHub OAuth app is Bloop AI's public app
- For production: Create your own GitHub OAuth app and set `GITHUB_CLIENT_ID` at build time

## Testing Railway Configuration Locally

Test the Docker build locally before deploying:

```bash
# Build the Docker image
docker build -t vibe-kanban-test .

# Run with Railway-style environment
docker run -p 3000:3000 -e PORT=3000 vibe-kanban-test

# Check health
curl http://localhost:3000/
```

## Troubleshooting

### Build Fails with TypeScript Errors

**Problem**: Frontend compilation fails during Docker build

**Solution**:
1. Fix TypeScript errors in the codebase first
2. Run `pnpm run generate-types` to update types
3. Run `cd frontend && pnpm run build` to verify it works locally
4. Then rebuild Docker image

### Server Doesn't Start

**Check logs for**:
- Port binding issues (should bind to `0.0.0.0:$PORT`)
- Database initialization errors
- Missing environment variables

### Health Check Fails

**Common causes**:
- Server not listening on correct port
- Health endpoint not responding (check `GET /`)
- Startup timeout exceeded (increase `healthcheckTimeout` in railway.toml)

### Git Operations Fail

**Possible issues**:
- `/repos` directory not writable (should be owned by `appuser`)
- Insufficient disk space for worktrees
- Git not available (should be in Alpine base image)

## Cost Estimates

Estimated monthly costs on Railway Pro tier:

- **Light usage** (few deployments, small repos): $20-30/month
- **Moderate usage** (daily deployments, multiple concurrent tasks): $40-60/month
- **Heavy usage** (continuous deployment, many concurrent worktrees): $80-120/month

Costs scale with:
- CPU time (task executions)
- Memory usage (concurrent operations)
- Network egress (git operations, API calls)
- Build time (recompilation on deploy)

## Security Considerations

1. **Non-root user**: Container runs as `appuser` (UID 1001)
2. **OAuth tokens**: Store GitHub PAT securely (use Railway secrets)
3. **Health checks**: Expose only necessary endpoints
4. **HTTPS**: Railway provides automatic SSL certificates
5. **Environment variables**: Never commit secrets to repository

## Support

For Railway-specific issues:
- Railway Documentation: https://docs.railway.app
- Railway Discord: https://discord.gg/railway

For Vibe Kanban issues:
- GitHub Issues: https://github.com/BloopAI/vibe-kanban/issues
- GitHub Discussions: https://github.com/BloopAI/vibe-kanban/discussions
