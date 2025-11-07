# Railway Deployment Guide

Complete guide to deploying Vibe Kanban on Railway with persistence, security, and production best practices.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Deployment Options](#deployment-options)
- [Configuration](#configuration)
- [Automation Scripts](#automation-scripts)
- [Post-Deployment](#post-deployment)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Cost & Scaling](#cost--scaling)
- [Additional Resources](#additional-resources)

---

## Prerequisites

### Required

- **GitHub Account** - For repository hosting and authentication
- **Railway Account** - Sign up free at [railway.app](https://railway.app)
- **Git Repository** - Your Vibe Kanban codebase

### Recommended

- **Railway CLI** - For automated deployment and management
  ```bash
  npm install -g @railway/cli
  ```

- **GitHub OAuth App** (Optional) - For custom branding and control
  - Only needed if you want to use your own OAuth app instead of the default

---

## Quick Start

### Option 1: Automated Setup (Recommended) ⚡

**Timeline**: 5-10 minutes

The fastest way to deploy using our automation scripts:

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Run interactive setup (creates project, configures environment)
./scripts/railway-setup.sh

# 4. Deploy with safety checks
./scripts/deploy-to-railway.sh
```

The setup script will guide you through:
- ✅ Railway project creation/linking
- ✅ Database configuration (SQLite volume or PostgreSQL)
- ✅ Environment variable setup
- ✅ GitHub OAuth configuration (optional)
- ✅ Analytics configuration (optional)

**What you get:**
- Fully configured Railway project
- Persistent database (if you choose SQLite + Volume)
- Production-ready environment variables
- Automated deployment with safety checks

---

### Option 2: Manual Setup via Railway Dashboard 🖱️

**Timeline**: 10-15 minutes

Deploy directly from Railway's web interface:

**Step 1: Connect Repository**
1. Go to [railway.app](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your Vibe Kanban repository
5. Railway auto-detects the `Dockerfile`

**Step 2: Add Database Persistence (Recommended)**
1. In your Railway project, click **"Storage"**
2. Click **"New Volume"**
3. Configure:
   - Name: `vibe-kanban-data`
   - Mount Path: `/data`
4. Click **"Create Volume"**

**Step 3: Set Environment Variables**
1. Click **"Variables"** tab
2. Add the following (only `DATABASE_URL` is needed for persistence):
   ```bash
   DATABASE_URL=sqlite:///data/db.sqlite
   RUST_LOG=info
   ```

**Step 4: Deploy**
1. Railway automatically deploys on first connection
2. Monitor the build in **"Deployments"** tab
3. Wait for health check to pass (~3-5 minutes)

**Step 5: Access Your Deployment**
1. Click **"Settings"** → **"Networking"**
2. Railway provides a public domain: `https://your-app.railway.app`
3. Visit the URL in your browser

**What you get:**
- Working deployment with default configuration
- Persistent database (if you added volume)
- Public HTTPS URL with SSL certificate
- GitHub authentication via default OAuth app

---

### Option 3: Railway CLI Deploy 🚀

**Timeline**: 5 minutes

For developers who prefer command-line workflows:

```bash
# 1. Login to Railway
railway login

# 2. Initialize in your project directory
cd /path/to/vibe-kanban
railway init

# 3. Link to a new or existing project
railway link

# 4. Set environment variables (optional)
railway variables set DATABASE_URL=sqlite:///data/db.sqlite
railway variables set RUST_LOG=info

# 5. Deploy
railway up

# 6. Get your deployment URL
railway domain
```

**What you get:**
- Quick CLI-based deployment
- Same infrastructure as dashboard setup
- Easy scripting and automation

---

## Deployment Options

### Minimal (Ephemeral) 🧪

**Best for**: Testing, demos, quick trials

**Configuration**:
```bash
# No variables needed! Railway auto-provides PORT
```

**Features**:
- ✅ Instant deployment
- ✅ GitHub OAuth (default Bloop AI app)
- ⚠️ Database resets on redeploy (ephemeral)
- ⚠️ No data persistence

---

### Standard Production (SQLite + Volume) 🏗️

**Best for**: Most production deployments, small-to-medium teams

**Configuration**:
```bash
DATABASE_URL=sqlite:///data/db.sqlite
RUST_LOG=info
```

**Setup**:
1. Create Railway volume mounted at `/data`
2. Set `DATABASE_URL` environment variable
3. Deploy

**Features**:
- ✅ Persistent database across redeploys
- ✅ Simple backup (download single file)
- ✅ Low cost (no separate database addon)
- ✅ Fast local file access
- ⚠️ Single instance only (no horizontal scaling)

**Cost**: $20-40/month on Pro plan

---

### Enterprise (PostgreSQL) 🏢

**Best for**: High-scale deployments, multiple replicas, enterprise requirements

**Configuration**:
```bash
# DATABASE_URL auto-set by Railway PostgreSQL plugin
RUST_LOG=info
GITHUB_CLIENT_ID=<your-custom-oauth-app>
```

**Setup**:
1. Add Railway PostgreSQL plugin
2. Railway auto-sets `DATABASE_URL`
3. Update code for PostgreSQL (may require migration changes)
4. Deploy

**Features**:
- ✅ Horizontal scaling (multiple instances)
- ✅ Managed backups
- ✅ High availability
- ✅ Better concurrency
- ⚠️ Higher cost ($25-50/month extra)
- ⚠️ Requires SQLite → PostgreSQL migration

**Cost**: $50-100/month on Pro plan

---

## Configuration

### Environment Variables

**Auto-Provided by Railway:**
```bash
PORT=<auto>  # DO NOT SET MANUALLY
```

**Recommended for Production:**
```bash
DATABASE_URL=sqlite:///data/db.sqlite  # If using volume
RUST_LOG=info                          # Logging level
```

**Optional - Custom GitHub OAuth:**
```bash
GITHUB_CLIENT_ID=Ov23liYourAppClientId
```

**Optional - Git Performance Tuning:**
```bash
GIT_SCAN_TIMEOUT_MS=10000
GIT_SCAN_HARD_TIMEOUT_MS=20000
GIT_SCAN_MAX_DEPTH=3
```

**Optional - Analytics:**
```bash
POSTHOG_API_KEY=phc_your_key_here
POSTHOG_API_ENDPOINT=https://us.i.posthog.com
```

**For complete environment variable reference**, see **[RAILWAY_ENVIRONMENT.md](RAILWAY_ENVIRONMENT.md)**.

---

### GitHub OAuth Setup

**Option 1: Use Default (Fastest)**

No setup required! The app uses Bloop AI's public GitHub OAuth app by default.

**Option 2: Custom OAuth App (Production)**

1. **Create GitHub OAuth App**:
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Click "New OAuth App"
   - Fill in:
     - Name: `Vibe Kanban Production`
     - Homepage URL: `https://your-app.railway.app`
     - Callback URL: (leave empty)
   - Enable **Device Flow** ✓

2. **Copy Client ID**:
   - Example: `Ov23liYourProductionClientId123`

3. **Set in Railway**:
   ```bash
   railway variables set GITHUB_CLIENT_ID=Ov23liYourProductionClientId123
   ```

4. **Redeploy**:
   ```bash
   railway up
   ```

**For detailed OAuth setup**, see [RAILWAY_ENVIRONMENT.md - GitHub OAuth Configuration](RAILWAY_ENVIRONMENT.md#github-oauth-configuration).

---

## Automation Scripts

Vibe Kanban includes several automation scripts for common Railway operations:

### Setup and Deployment

**`railway-setup.sh`** - Interactive Railway project setup
```bash
./scripts/railway-setup.sh
```
- Creates Railway project (or links existing)
- Configures database (SQLite volume or PostgreSQL)
- Sets environment variables
- Guides through GitHub OAuth setup (optional)

**`deploy-to-railway.sh`** - Deploy with safety checks
```bash
./scripts/deploy-to-railway.sh
```
- Checks for uncommitted changes
- Verifies TypeScript types
- Validates SQLx migrations
- Shows current environment variables
- Deploys to Railway
- Opens deployment dashboard

---

### Monitoring

**`railway-logs.sh`** - Stream and filter logs
```bash
# Stream all logs
./scripts/railway-logs.sh

# Filter for errors only
./scripts/railway-logs.sh --errors

# Filter for database logs
./scripts/railway-logs.sh --database

# Filter for git operations
./scripts/railway-logs.sh --git
```

---

### Database Management

**`railway-backup-db.sh`** - Download database backup
```bash
./scripts/railway-backup-db.sh
```
- Downloads SQLite database from Railway volume
- Creates timestamped backup file
- Verifies backup integrity

**`railway-restore-db.sh`** - Restore database from backup
```bash
./scripts/railway-restore-db.sh backup-file.sqlite
```
- Uploads backup to Railway volume
- Creates pre-restore backup
- Verifies restoration
- Includes safety checks

**For complete database management guide**, see **[RAILWAY_DATABASE_GUIDE.md](RAILWAY_DATABASE_GUIDE.md)**.

---

### Makefile Shortcuts

Use the Railway Makefile for common tasks:

```bash
# Show all available commands
make -f Makefile.railway help

# Initial setup
make -f Makefile.railway setup

# Deploy
make -f Makefile.railway deploy

# Stream logs
make -f Makefile.railway logs

# Backup database
make -f Makefile.railway backup

# Open Railway dashboard
make -f Makefile.railway open
```

---

## Post-Deployment

### Verification Checklist

After deploying, verify everything works:

**1. Health Check**
```bash
curl https://your-app.railway.app/
# Should return 200 OK with HTML
```

**2. UI Access**
- Visit Railway URL in browser
- Verify landing page loads
- No console errors

**3. GitHub Authentication**
- Click "Connect GitHub"
- Complete device flow authorization
- Verify dashboard loads

**4. Create Test Project**
- Create new project
- Create new task
- Verify task appears in UI

**5. Data Persistence** (if using volume)
- Trigger redeploy: `railway up`
- Verify data still exists after redeploy

---

### Monitor Deployment

**View Logs:**
```bash
# Via script
./scripts/railway-logs.sh

# Via Railway CLI
railway logs --tail

# Via dashboard
Railway → Deployments → [Latest] → Logs
```

**Check Metrics:**
```
Railway Dashboard → Deployments → [Latest] → Metrics
```

Monitor:
- Memory usage (should be < 1GB)
- CPU usage (spikes during git operations are normal)
- Restart count (should be 0)
- Response time

---

### Set Up Alerts

Configure Railway alerts for production monitoring:

```
Railway → Settings → Notifications
```

Recommended alerts:
- Deployment failures
- Health check failures
- Memory usage > 80%
- CPU usage > 80%

---

## Maintenance

### Updating Vibe Kanban

**Deploy New Version:**
```bash
# 1. Backup database first
./scripts/railway-backup-db.sh

# 2. Pull latest changes
git pull origin main

# 3. Deploy with safety checks
./scripts/deploy-to-railway.sh

# 4. Monitor deployment
./scripts/railway-logs.sh
```

**Rollback to Previous Version:**
```bash
# Via Railway dashboard
Railway → Deployments → [Previous Stable] → Redeploy

# Via Railway CLI
railway rollback
```

---

### Database Backups

**Automated Backup Schedule:**
```bash
# Set up cron job for daily backups
0 2 * * * cd /path/to/vibe-kanban && ./scripts/railway-backup-db.sh
```

**Manual Backup:**
```bash
./scripts/railway-backup-db.sh
```

**Backup Strategy:**
- Daily automated backups
- Before major updates
- Before database migrations
- Keep last 30 days of backups

**For complete backup procedures**, see **[RAILWAY_DATABASE_GUIDE.md](RAILWAY_DATABASE_GUIDE.md)**.

---

### Security Maintenance

**Regular Security Tasks:**

1. **Rotate GitHub Client ID** (annually):
   - Create new GitHub OAuth app
   - Update `GITHUB_CLIENT_ID` in Railway
   - Redeploy
   - Disable old OAuth app after migration

2. **Review Access Logs** (monthly):
   - Check Railway audit logs
   - Review GitHub OAuth app usage
   - Monitor for suspicious activity

3. **Update Dependencies** (quarterly):
   - Update Rust dependencies: `cargo update`
   - Update Node dependencies: `pnpm update`
   - Test locally, then deploy

---

## Troubleshooting

### Common Issues

**Build Failures**

**Problem**: Frontend build errors during deployment

**Solution**:
```bash
# Fix locally first
cd frontend && pnpm run build

# If errors persist
pnpm run generate-types  # Regenerate TypeScript types
pnpm exec tsc --noEmit    # Check for type errors

# Commit fixes and redeploy
git add . && git commit -m "Fix build errors"
./scripts/deploy-to-railway.sh
```

---

**Server Won't Start**

**Problem**: Logs show "Address already in use"

**Solution**: Railway manages `PORT` automatically
```bash
# Remove PORT from Railway variables (if you set it)
railway variables delete PORT

# Railway will auto-assign PORT
railway up
```

---

**Database Not Found**

**Problem**: Logs show "unable to open database file"

**Solution**: Verify volume configuration
```bash
# Check volume mount path
Railway → Storage → vibe-kanban-data → Mount path: /data

# Verify DATABASE_URL matches mount path
railway variables
# Should show: DATABASE_URL=sqlite:///data/db.sqlite

# Fix if needed
railway variables set DATABASE_URL=sqlite:///data/db.sqlite
railway up
```

---

**GitHub OAuth Fails**

**Problem**: Device flow authorization fails

**Solution**: Verify GitHub OAuth app settings
1. Check Device Flow is enabled in GitHub app
2. Verify scopes include: `user:email`, `repo`
3. Check Client ID matches Railway variable
4. Verify GitHub app is active (not suspended)

---

**High Memory Usage**

**Problem**: Memory usage exceeds 1GB

**Solution**: Check worktree cleanup
```bash
# Verify cleanup is enabled (remove if present)
railway variables delete DISABLE_WORKTREE_ORPHAN_CLEANUP

# Redeploy to trigger cleanup
railway up

# Monitor memory
railway logs --tail | grep "memory"
```

---

**Slow Git Operations**

**Problem**: Git scanning times out

**Solution**: Increase timeouts
```bash
railway variables set GIT_SCAN_TIMEOUT_MS=20000
railway variables set GIT_SCAN_HARD_TIMEOUT_MS=30000
railway variables set GIT_SCAN_MAX_DEPTH=2

railway up
```

---

### Getting Help

**Railway Support:**
- [Railway Documentation](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Railway Status](https://status.railway.app)

**Vibe Kanban Support:**
- [GitHub Issues](https://github.com/BloopAI/vibe-kanban/issues)
- [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions)
- [Documentation](https://vibekanban.com/docs)

---

## Cost & Scaling

### Railway Pricing Plans

**Hobby Plan**: $5/month credit
- Limited resources
- Good for testing/demos
- May not handle production load

**Pro Plan**: $20/month minimum (recommended)
- Sufficient resources for most deployments
- Better uptime guarantees
- Scalable

---

### Estimated Monthly Costs

**Light Usage** (few users, small repos):
- **$20-30/month**
- 1 instance, 512MB-1GB RAM
- SQLite database
- Occasional deployments

**Moderate Usage** (team of 5-10, daily deploys):
- **$40-60/month**
- 1 instance, 1-2GB RAM
- SQLite database
- Daily deployments
- Regular git operations

**Heavy Usage** (large team, many concurrent agents):
- **$80-120/month**
- 2+ instances (if using PostgreSQL)
- 2-4GB RAM per instance
- PostgreSQL database ($10/month addon)
- Continuous deployments

---

### Cost Optimization Tips

1. **Use SQLite instead of PostgreSQL** - Save $10/month
2. **Monitor memory usage** - Scale down if underutilized
3. **Clean up worktrees** - Prevent memory bloat
4. **Optimize git operations** - Reduce CPU usage
5. **Use Railway's sleep feature** - Pause when not in use (Hobby plan)

---

### Scaling Strategies

**Vertical Scaling** (increase resources per instance):
```
Railway → Settings → Resources
- Increase memory limit
- Increase CPU allocation
```

**Horizontal Scaling** (multiple instances):
- Requires PostgreSQL database
- Add Railway PostgreSQL plugin
- Railway load balances automatically

**Note**: Current version optimized for single instance. Horizontal scaling requires database migration from SQLite to PostgreSQL.

---

## Additional Resources

### Complete Documentation

- **[RAILWAY_ENVIRONMENT.md](RAILWAY_ENVIRONMENT.md)** - Environment variables, GitHub OAuth, security best practices
- **[RAILWAY_DATABASE_GUIDE.md](RAILWAY_DATABASE_GUIDE.md)** - Database setup, backups, restoration, migration
- **[RAILWAY_CLI_REFERENCE.md](RAILWAY_CLI_REFERENCE.md)** - Railway CLI commands quick reference
- **[RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md)** - Technical deployment details and architecture
- **[docs/railway-quickstart.md](docs/railway-quickstart.md)** - 5-minute quick start guide

---

### Railway-Specific Features

**`railway.toml` Configuration:**

The project includes optimized Railway configuration:

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

Features:
- Docker-based builds
- Automatic restart on failure
- Health check monitoring
- 5-minute startup timeout

---

### Dockerfile Highlights

The Dockerfile is optimized for Railway:

**Build Stage:**
- Multi-stage build reduces image size
- Node.js 24 Alpine for frontend build
- Rust compilation with release profile
- Frontend assets embedded in binary

**Runtime Stage:**
- Alpine Linux (minimal footprint)
- Non-root user (`appuser`) for security
- Health check configured
- `/repos` directory for git worktrees

---

## FAQ

**Q: Do I need to set environment variables?**
A: No! Railway auto-provides `PORT`. The app works with defaults. Set `DATABASE_URL` only if you want persistence.

**Q: How do I add a custom domain?**
A: Railway → Settings → Domains → Add custom domain (Pro plan required)

**Q: Can I use PostgreSQL instead of SQLite?**
A: Yes! Add Railway PostgreSQL plugin. May require code changes for migrations.

**Q: How do I backup my database?**
A: Run `./scripts/railway-backup-db.sh` or use Railway dashboard to download volume.

**Q: What if my deployment fails?**
A: Check build logs in Railway dashboard. Most common issue is frontend TypeScript errors.

**Q: Can I run multiple instances?**
A: Requires PostgreSQL for shared state. SQLite only supports single instance.

**Q: How do I update to a new version?**
A: Backup database, pull latest code, run `./scripts/deploy-to-railway.sh`.

**Q: What about Railway's cold starts?**
A: Hobby plan may sleep after inactivity. Pro plan has minimal cold starts.

---

## Next Steps

After deploying:

1. ✅ **Verify deployment** - Complete verification checklist above
2. ✅ **Set up monitoring** - Configure Railway alerts
3. ✅ **Schedule backups** - Set up automated daily backups
4. ✅ **Invite team members** - Railway → Settings → Members
5. ✅ **Add custom domain** (optional) - Railway → Settings → Domains
6. ✅ **Configure custom OAuth** (optional) - Create GitHub OAuth app

---

**Document Version**: 1.0
**Last Updated**: 2025-11-06
**Compatible with**: Vibe Kanban v0.0.113+, Railway v2.0+

---

**Ready to deploy?** Run `./scripts/railway-setup.sh` to get started! 🚀
