# Railway Production Environment Configuration

This document provides comprehensive guidance for configuring environment variables and secrets for deploying Vibe Kanban to Railway.

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Variables Reference](#environment-variables-reference)
- [GitHub OAuth Configuration](#github-oauth-configuration)
- [Database Strategy](#database-strategy)
- [Security Best Practices](#security-best-practices)
- [Deployment Checklist](#deployment-checklist)

---

## Quick Start

### Minimal Production Configuration

Railway automatically provides `PORT` environment variable. The following configuration requires **no additional environment variables** for basic deployment:

```bash
# Railway auto-provides:
PORT=<auto-assigned>  # Railway sets this automatically

# Application defaults (works out of the box):
HOST=0.0.0.0          # Set in Dockerfile
RUST_LOG=info         # App default
```

**You can deploy immediately without setting any environment variables!**

### Recommended Production Configuration

For production use, configure these optional variables in Railway dashboard:

```bash
# Logging (optional)
RUST_LOG=info

# GitHub OAuth (optional - use your own app)
GITHUB_CLIENT_ID=Ov23liYourProductionClientId

# Git Operations (optional - tune for your workload)
GIT_SCAN_TIMEOUT_MS=10000
GIT_SCAN_HARD_TIMEOUT_MS=20000
GIT_SCAN_MAX_DEPTH=3

# Worktree Storage (optional - use if you add a volume)
VIBE_WORKTREE_DIR=/repos/worktrees
```

---

## Environment Variables Reference

### Runtime Variables (Set in Railway Dashboard)

These variables are read when the application starts and can be changed without rebuilding:

| Variable | Type | Default | Railway Value | Description |
|----------|------|---------|---------------|-------------|
| `PORT` | Auto | `3000` | **Auto-set by Railway** | Server port - DO NOT SET MANUALLY |
| `HOST` | String | `0.0.0.0` | Use default | Bind address (already in Dockerfile) |
| `RUST_LOG` | String | `info` | `info` or `debug` | Log level: `trace`, `debug`, `info`, `warn`, `error` |
| `VIBE_WORKTREE_DIR` | Path | `/repos` | `/repos/worktrees` | Directory for git worktrees |
| `GIT_SCAN_TIMEOUT_MS` | Number | `5000` | `10000` | Git repository scan timeout (ms) |
| `GIT_SCAN_HARD_TIMEOUT_MS` | Number | `10000` | `20000` | Git repository hard timeout (ms) |
| `GIT_SCAN_MAX_DEPTH` | Number | `3` | `3` | Maximum directory depth for git scanning |
| `DISABLE_WORKTREE_ORPHAN_CLEANUP` | Boolean | Not set | Not set | Disable git worktree cleanup (debugging only) |
| `DATABASE_URL` | String | `sqlite://dev_assets/db.sqlite` | See [Database Strategy](#database-strategy) | Database connection string |

### Build-Time Variables (Baked into Binary)

These variables must be set **before deploying** in Railway environment variables. Changing them requires a **rebuild**:

| Variable | Type | Default | Production Value | Description |
|----------|------|---------|------------------|-------------|
| `GITHUB_CLIENT_ID` | String | `Ov23li9bxz3kKfPOIsGm` | Your GitHub App Client ID | GitHub OAuth app for authentication |
| `POSTHOG_API_KEY` | String | Empty (disabled) | Your PostHog project API key | Analytics key (leave empty to disable) |
| `POSTHOG_API_ENDPOINT` | String | Empty (disabled) | `https://us.i.posthog.com` | PostHog endpoint (leave empty to disable) |
| `GITHUB_APP_ID` | String | Not set | Not typically needed | GitHub App ID (if using GitHub App auth) |
| `GITHUB_APP_CLIENT_ID` | String | Not set | Not typically needed | Alternative to `GITHUB_CLIENT_ID` |

**Important**: Build-time variables are compiled into the binary via `crates/server/build.rs`. To change them:
1. Update environment variable in Railway dashboard
2. Trigger a new deployment (Railway will rebuild)
3. Variable is now baked into the new binary

---

## GitHub OAuth Configuration

### Option 1: Use Default (Bloop AI's Public App)

**Recommended for**: Quick testing, demos, personal use

The application includes Bloop AI's public GitHub OAuth app by default:
- Client ID: `Ov23li9bxz3kKfPOIsGm`
- Device Flow enabled
- Scopes: `user:email`, `repo`
- **No configuration needed!**

### Option 2: Create Your Own GitHub OAuth App (Recommended for Production)

**Recommended for**: Production deployments, custom branding, organizational control

#### Step 1: Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"** (or "New GitHub App" for advanced features)
3. Fill in application details:
   ```
   Application name: Vibe Kanban Production
   Homepage URL: https://your-railway-app.railway.app
   Application description: AI coding agent orchestration platform
   Authorization callback URL: (Leave empty - we use Device Flow!)
   ```
4. Click **"Register application"**

#### Step 2: Enable Device Flow

1. In your OAuth app settings, scroll to **"Device Flow"**
2. Check **"Enable Device Flow"**
3. Save changes

#### Step 3: Configure Scopes

Device Flow automatically uses these scopes (configured in code):
- `user:email` - Read user email addresses
- `repo` - Access repositories for worktree creation

**No additional scope configuration needed!**

#### Step 4: Get Client ID

1. Copy your **Client ID** from the OAuth app settings page
   - Example: `Ov23liYourProductionClientId123`
2. **Never commit this to git!**

#### Step 5: Set in Railway

1. Go to Railway project → **Variables** tab
2. Add new variable:
   ```
   GITHUB_CLIENT_ID=Ov23liYourProductionClientId123
   ```
3. Click **"Deploy"** to rebuild with new client ID

#### Why Device Flow?

Vibe Kanban uses GitHub's [Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) for authentication:

**Benefits**:
- ✅ No callback URL required (perfect for Railway's dynamic URLs)
- ✅ Works with CLI and headless environments
- ✅ Simple user experience (copy code, paste in browser)
- ✅ No server-side secret required
- ✅ Supports Railway's domain changes and previews

**Authentication Flow**:
1. User clicks "Connect GitHub" in UI
2. Server generates device code via GitHub API
3. User visits `github.com/login/device` and enters code
4. Server polls GitHub until user authorizes
5. Access token stored in database

**Security Note**: Client ID is public (embedded in frontend), which is safe for Device Flow. Only the user's GitHub authorization grants access.

---

## Database Strategy

Railway deployment requires choosing between SQLite (with volume) or PostgreSQL. Each has trade-offs:

### Option A: SQLite with Railway Volume (Recommended)

**Best for**: Most deployments, simple setup, cost-effective

#### Advantages
- ✅ **Zero configuration** - works out of the box
- ✅ **Low cost** - no separate database addon
- ✅ **Fast queries** - local file access
- ✅ **Simple backups** - single file to download
- ✅ **No migrations** - existing schema works
- ✅ **Portable** - can download and run locally

#### Limitations
- ⚠️ **Single instance only** - cannot scale horizontally
- ⚠️ **Ephemeral by default** - data lost on redeploy
- ⚠️ **Requires volume mount** - needs Railway volume for persistence

#### Configuration Steps

1. **Create Railway Volume**:
   ```
   Railway Dashboard → Your Project → Storage → New Volume
   Name: vibe-kanban-data
   Mount Path: /data
   ```

2. **Set Environment Variable**:
   ```bash
   DATABASE_URL=sqlite:///data/db.sqlite
   ```

3. **Verify Volume Mount**:
   - Railway automatically mounts volume at `/data`
   - Application creates `db.sqlite` on first run
   - Database persists across deployments

4. **Update Dockerfile** (if using custom volume path):
   ```dockerfile
   # Create data directory for volume mount
   RUN mkdir -p /data && \
       chown -R appuser:appgroup /data
   ```

#### Backup Strategy
```bash
# Download database from Railway volume (via Railway CLI)
railway volume download vibe-kanban-data db.sqlite ./backup.sqlite

# Or use Railway dashboard:
# Storage → vibe-kanban-data → Download file → db.sqlite
```

**Default behavior (no volume)**: Database is ephemeral and resets on each deploy. **Add a volume for production!**

### Option B: PostgreSQL with Railway Addon

**Best for**: High-scale deployments, multiple replicas, enterprise requirements

#### Advantages
- ✅ **Horizontal scaling** - multiple app instances
- ✅ **Managed backups** - Railway handles backups
- ✅ **Higher concurrency** - better for multiple agents
- ✅ **Automatic failover** - high availability
- ✅ **Metrics and monitoring** - Railway dashboard

#### Limitations
- ❌ **Requires migration** - SQLx migrations may need updates
- ❌ **Higher cost** - $5-10/month addon
- ❌ **More complex** - additional configuration
- ❌ **Slower local dev** - must connect to remote DB

#### Configuration Steps

1. **Add PostgreSQL Plugin**:
   ```
   Railway Dashboard → Your Project → New → Database → PostgreSQL
   ```

2. **Railway Auto-Sets**:
   ```bash
   DATABASE_URL=postgresql://user:pass@host:5432/railway
   ```

3. **Update SQLx Migrations** (if needed):
   ```bash
   # Test migrations locally first
   DATABASE_URL="postgresql://..." sqlx migrate run

   # Some SQLite-specific syntax may need updates:
   # - INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
   # - DATETIME → TIMESTAMP
   # - Check constraints syntax
   ```

4. **Update Cargo.toml Dependencies**:
   ```toml
   [dependencies]
   sqlx = { version = "0.8.6", features = ["runtime-tokio-rustls", "postgres"] }
   ```

5. **Rebuild and Deploy**:
   - Changing database requires code changes
   - Test thoroughly in staging first

#### Migration Notes

The codebase uses SQLx with SQLite. Converting to PostgreSQL requires:
- ✅ Update `Cargo.toml` features
- ⚠️ Review migrations in `crates/db/migrations/`
- ⚠️ Test all queries (some SQLite syntax differs)
- ⚠️ Regenerate query cache: `cargo sqlx prepare`

### Decision Matrix

| Factor | SQLite + Volume | PostgreSQL |
|--------|----------------|------------|
| **Setup Complexity** | ⭐⭐⭐⭐⭐ Simple | ⭐⭐⭐ Moderate |
| **Cost** | ⭐⭐⭐⭐⭐ Low | ⭐⭐⭐ Higher |
| **Scalability** | ⭐⭐ Single instance | ⭐⭐⭐⭐⭐ Horizontal |
| **Performance** | ⭐⭐⭐⭐ Fast (local) | ⭐⭐⭐ Network latency |
| **Backup/Recovery** | ⭐⭐⭐ Manual file | ⭐⭐⭐⭐⭐ Automated |
| **Development** | ⭐⭐⭐⭐⭐ Portable | ⭐⭐ Remote only |

**Recommendation**: Start with **SQLite + Volume**. Migrate to PostgreSQL only if you need horizontal scaling.

---

## Security Best Practices

### 1. Environment Variable Security

#### ✅ DO:
- **Use Railway's built-in secret management**
  - Variables tab → Add variable → Railway encrypts at rest
  - Secrets never appear in logs or build output
- **Separate dev/staging/production environments**
  - Create separate Railway projects for each environment
  - Use different GitHub OAuth apps per environment
- **Rotate credentials regularly**
  - Update `GITHUB_CLIENT_ID` if app is compromised
  - Rotate `POSTHOG_API_KEY` annually
- **Use Railway's shared variables**
  - Share common config across services in same project

#### ❌ DON'T:
- **Never commit secrets to git**
  - No `.env` files with production secrets
  - Use `.env.example` with placeholder values only
- **Never log sensitive values**
  - Railway logs are visible in dashboard
  - Application already strips ANSI from env vars (see `main.rs:70-82`)
- **Never hardcode credentials**
  - Always use environment variables
  - Even for "public" OAuth client IDs

### 2. GitHub OAuth Security

#### Token Storage
- ✅ User tokens stored in database (SQLite/PostgreSQL)
- ✅ Tokens never logged or exposed in API responses
- ✅ Device Flow prevents token interception (no redirects)

#### Token Scopes (Minimal Permissions)
```rust
// crates/services/src/services/auth.rs:78
["user:email", "repo"]  // Only what's needed
```

- ✅ `user:email` - Required for user identification
- ✅ `repo` - Required for git worktree operations
- ❌ No admin or org scopes (unnecessary)

#### OAuth App Security Checklist
- [ ] Enable Device Flow only (disable web flow if possible)
- [ ] Set Homepage URL to production Railway domain
- [ ] Document which scopes are used and why
- [ ] Monitor OAuth app usage in GitHub settings
- [ ] Revoke and rotate if client ID is leaked

### 3. Container Security

The Dockerfile already implements security best practices:

```dockerfile
# Non-root user (already configured)
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup
USER appuser

# Minimal base image
FROM alpine:latest  # Small attack surface

# No secrets in image layers
# All secrets via environment variables
```

#### Additional Security Measures
- ✅ **Railway automatic HTTPS** - Free SSL certificates
- ✅ **Private networking** - Services can use private DNS
- ✅ **Health checks** - Auto-restart on failure
- ✅ **Isolated environments** - Each Railway project is isolated

### 4. Secret Rotation Procedures

#### GitHub Client ID Rotation
1. Create new GitHub OAuth app (follow [GitHub OAuth Configuration](#github-oauth-configuration))
2. Update `GITHUB_CLIENT_ID` in Railway → Variables
3. Click **"Deploy"** to rebuild with new client ID
4. **Existing user sessions invalidated** - users must re-authenticate
5. Disable old GitHub OAuth app after migration period

#### Database Backup Before Rotation
```bash
# Before rotating any production secrets
railway volume download vibe-kanban-data db.sqlite ./pre-rotation-backup.sqlite
```

### 5. Monitoring and Alerts

#### Set Up Railway Alerts
```
Railway Dashboard → Project → Settings → Alerts
- Memory usage > 80%
- CPU usage > 80%
- Deployment failures
- Health check failures
```

#### Application Logging
```bash
# Set RUST_LOG for production monitoring
RUST_LOG=info  # Standard logging
RUST_LOG=debug # Troubleshooting (verbose)

# Logs available in Railway dashboard:
Railway → Project → Deployments → [Latest] → Logs
```

#### Security Monitoring
- Review Railway audit logs monthly
- Monitor GitHub OAuth app usage
- Check for unexpected user authentication patterns
- Review Railway access tokens (team access)

### 6. Compliance and Data Privacy

#### Data Storage
- User GitHub tokens stored encrypted in database
- No PII collected beyond GitHub email (optional)
- No analytics if `POSTHOG_API_KEY` is empty

#### GDPR Considerations
- Users control their data via GitHub account
- Token revocation supported
- Database exports available via Railway volume download

---

## Deployment Checklist

### Pre-Deployment

- [ ] **Code Quality**
  - [ ] All TypeScript compilation errors fixed
  - [ ] Rust code passes `cargo clippy`
  - [ ] Tests pass: `pnpm run check`
  - [ ] Frontend builds: `cd frontend && pnpm run build`

- [ ] **Docker Build Test**
  ```bash
  docker build -t vibe-kanban-test .
  docker run -p 3000:3000 -e PORT=3000 vibe-kanban-test
  curl http://localhost:3000/  # Should return 200 OK
  ```

- [ ] **Database Preparation**
  - [ ] Choose database strategy (SQLite + Volume or PostgreSQL)
  - [ ] If PostgreSQL: Test migrations locally
  - [ ] If SQLite: Plan volume mount strategy

- [ ] **GitHub OAuth Setup**
  - [ ] Decide: Use default Bloop app or create custom app
  - [ ] If custom: Create GitHub OAuth app with Device Flow enabled
  - [ ] If custom: Copy Client ID (do NOT commit to git)

### Railway Initial Setup

- [ ] **Create Railway Project**
  ```
  1. Log in to Railway (https://railway.app)
  2. New Project → Deploy from GitHub repo
  3. Select your vibe-kanban fork/repository
  4. Railway auto-detects Dockerfile
  ```

- [ ] **Configure Database** (Choose one)

  **Option A: SQLite + Volume**
  - [ ] Create volume: Storage → New Volume
    - Name: `vibe-kanban-data`
    - Mount path: `/data`
  - [ ] Set variable: `DATABASE_URL=sqlite:///data/db.sqlite`

  **Option B: PostgreSQL**
  - [ ] Add plugin: New → Database → PostgreSQL
  - [ ] Railway auto-sets `DATABASE_URL`
  - [ ] Verify migrations: `sqlx migrate run`

- [ ] **Set Environment Variables**

  **Required** (if using custom GitHub app):
  ```bash
  GITHUB_CLIENT_ID=Ov23liYourProductionClientId
  ```

  **Recommended**:
  ```bash
  RUST_LOG=info
  GIT_SCAN_TIMEOUT_MS=10000
  GIT_SCAN_HARD_TIMEOUT_MS=20000
  ```

  **Optional** (analytics):
  ```bash
  POSTHOG_API_KEY=phc_your_key
  POSTHOG_API_ENDPOINT=https://us.i.posthog.com
  ```

- [ ] **Review railway.toml**
  ```toml
  [deploy]
  restartPolicyType = "ON_FAILURE"
  restartPolicyMaxRetries = 10
  healthcheckPath = "/"
  healthcheckTimeout = 300
  ```

### Deployment

- [ ] **Trigger First Deploy**
  - Railway auto-deploys on `git push` to main branch
  - Or manually: Railway → Deployments → Deploy

- [ ] **Monitor Build**
  ```
  Railway → Deployments → [Latest] → Build Logs

  Expected steps:
  ✓ Installing Node.js dependencies
  ✓ Installing Rust
  ✓ Building frontend (npm run generate-types, frontend build)
  ✓ Building backend (cargo build --release)
  ✓ Creating runtime image
  ✓ Health check passed
  ```

- [ ] **Monitor Startup**
  ```
  Railway → Deployments → [Latest] → Deploy Logs

  Expected logs:
  ✓ "Server running on http://0.0.0.0:<PORT>"
  ✓ No database errors
  ✓ No git initialization errors
  ```

- [ ] **Verify Health Check**
  ```bash
  curl https://your-app.railway.app/
  # Should return 200 OK with HTML
  ```

### Post-Deployment Verification

- [ ] **Test Authentication**
  - [ ] Visit Railway URL in browser
  - [ ] Click "Connect GitHub"
  - [ ] Verify device code flow works
  - [ ] Complete authorization
  - [ ] Verify dashboard loads

- [ ] **Test Core Functionality**
  - [ ] Create a new project
  - [ ] Create a new task
  - [ ] Verify task appears in UI
  - [ ] Test git repository scanning

- [ ] **Database Verification**
  - [ ] Data persists after creating task
  - [ ] Redeploy and verify data still exists (if using volume)
  - [ ] Test database backups (download volume if SQLite)

- [ ] **Monitor Performance**
  ```
  Railway → Deployments → [Latest] → Metrics

  Check:
  - Memory usage (should be < 1GB for typical load)
  - CPU usage (spikes during git operations are normal)
  - Restart count (should be 0)
  ```

### Security Verification

- [ ] **Verify HTTPS**
  - [ ] Railway URL uses HTTPS automatically
  - [ ] No mixed content warnings
  - [ ] SSL certificate valid

- [ ] **Verify Environment Variables**
  - [ ] No secrets visible in build logs
  - [ ] No secrets in Railway deployment logs
  - [ ] GitHub Client ID not exposed in frontend network requests

- [ ] **Test OAuth Security**
  - [ ] Token not visible in browser dev tools
  - [ ] Token not in URL parameters
  - [ ] Logout works (clears session)

### Monitoring Setup

- [ ] **Configure Railway Alerts**
  ```
  Railway → Settings → Notifications
  - Email alerts for deployment failures
  - Slack/Discord webhook (optional)
  ```

- [ ] **Bookmark Important URLs**
  - Production URL: `https://your-app.railway.app`
  - Railway dashboard: `https://railway.app/project/your-project-id`
  - GitHub OAuth app: `https://github.com/settings/developers`

- [ ] **Document Configuration**
  - [ ] Save environment variable list to password manager
  - [ ] Document database strategy choice
  - [ ] Record Railway project ID and region

### Rollback Plan

- [ ] **Prepare Rollback Procedure**
  ```
  Railway → Deployments → [Previous Stable] → Redeploy

  Or via CLI:
  railway rollback
  ```

- [ ] **Database Backup**
  ```bash
  # Before major changes, backup database
  railway volume download vibe-kanban-data db.sqlite ./backup-$(date +%Y%m%d).sqlite
  ```

- [ ] **Test Rollback** (in staging environment)
  - Deploy new version
  - Trigger rollback
  - Verify application still works

### Production Readiness

- [ ] **Performance Testing**
  - [ ] Load test with expected user count
  - [ ] Test concurrent task executions
  - [ ] Verify git worktree operations don't exhaust memory

- [ ] **Cost Estimation**
  ```
  Railway → Project → Usage

  Typical costs:
  - Light usage: $20-30/month (Pro tier)
  - Moderate: $40-60/month
  - Heavy: $80-120/month

  Adjust resources if needed
  ```

- [ ] **Team Access** (if applicable)
  ```
  Railway → Settings → Members
  - Invite team members
  - Set appropriate permissions (Admin, Member, Viewer)
  ```

---

## Troubleshooting

### Build Failures

**Problem**: TypeScript compilation errors during `frontend build`

**Solution**:
```bash
# Fix locally first
cd frontend && pnpm run build

# If errors:
pnpm run generate-types  # Regenerate types from Rust
pnpm exec tsc --noEmit    # Check TypeScript errors
```

**Problem**: Cargo build fails with `GITHUB_CLIENT_ID not found`

**Solution**: Build-time variables must be set in Railway **before** deploying:
```
Railway → Variables → Add Variable → GITHUB_CLIENT_ID=...
Then: Trigger new deployment
```

### Runtime Failures

**Problem**: Server doesn't start, logs show "Address already in use"

**Solution**: Railway manages `PORT` automatically, don't override:
```bash
# Remove these from Railway variables if present:
PORT=<anything>        # Let Railway set this
BACKEND_PORT=<anything> # Not needed on Railway
```

**Problem**: Database errors `unable to open database file`

**Solution**: Volume not mounted correctly:
```bash
# Verify volume mount path matches DATABASE_URL:
DATABASE_URL=sqlite:///data/db.sqlite  # Volume must be mounted at /data

# Check Railway volume:
Railway → Storage → vibe-kanban-data → Mount path: /data
```

### Authentication Failures

**Problem**: GitHub OAuth device flow fails

**Solution**: Verify GitHub OAuth app settings:
```
1. Check Device Flow is enabled in GitHub app settings
2. Verify scopes include: user:email, repo
3. Verify Client ID matches GITHUB_CLIENT_ID in Railway
```

**Problem**: Users can't complete authorization

**Solution**: Check GitHub app status:
```
GitHub → Settings → Developer settings → OAuth Apps → [Your App]
- Status: Active (not suspended)
- Rate limits: Not exceeded
```

### Performance Issues

**Problem**: High memory usage (>1GB)

**Solution**: Git worktrees accumulate over time:
```bash
# Enable cleanup (default, but verify not disabled):
# Remove this variable if present:
DISABLE_WORKTREE_ORPHAN_CLEANUP=<anything>

# Worktrees are cleaned up automatically on server start
```

**Problem**: Slow git operations

**Solution**: Tune git scan timeouts:
```bash
# Increase timeouts for large repositories:
GIT_SCAN_TIMEOUT_MS=20000
GIT_SCAN_HARD_TIMEOUT_MS=30000
GIT_SCAN_MAX_DEPTH=2  # Reduce depth for faster scanning
```

---

## Support Resources

### Railway Documentation
- [Railway Docs](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Railway Status](https://status.railway.app)

### Vibe Kanban
- [GitHub Issues](https://github.com/BloopAI/vibe-kanban/issues)
- [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions)
- [Documentation](https://vibekanban.com/docs)

### GitHub OAuth
- [Device Flow Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
- [OAuth Best Practices](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-oauth-apps)

---

## Appendix: Complete Environment Variable Template

Copy this template to Railway Variables tab:

```bash
# === REQUIRED (Railway Auto-Provides) ===
# PORT=<auto>  # DO NOT SET - Railway provides automatically

# === RECOMMENDED FOR PRODUCTION ===
RUST_LOG=info
GITHUB_CLIENT_ID=Ov23liYourProductionClientId123

# === DATABASE (Choose One) ===
# Option A: SQLite with Volume (default, requires Railway volume)
DATABASE_URL=sqlite:///data/db.sqlite

# Option B: PostgreSQL (requires Railway PostgreSQL plugin)
# DATABASE_URL=<auto-set by Railway PostgreSQL plugin>

# === GIT OPERATIONS (Optional - Tune for Performance) ===
GIT_SCAN_TIMEOUT_MS=10000
GIT_SCAN_HARD_TIMEOUT_MS=20000
GIT_SCAN_MAX_DEPTH=3
VIBE_WORKTREE_DIR=/repos/worktrees

# === ANALYTICS (Optional - Leave Empty to Disable) ===
# POSTHOG_API_KEY=phc_your_key_here
# POSTHOG_API_ENDPOINT=https://us.i.posthog.com

# === DEBUGGING (Optional - Only for Troubleshooting) ===
# RUST_LOG=debug  # Verbose logging
# DISABLE_WORKTREE_ORPHAN_CLEANUP=1  # Disable automatic cleanup
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-06
**Compatible with**: Vibe Kanban v0.0.113+, Railway v2.0+
