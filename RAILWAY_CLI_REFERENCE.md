# Railway CLI Quick Reference

Quick reference for Railway CLI commands used with Vibe Kanban deployment.

## Installation

```bash
# NPM
npm install -g @railway/cli

# Homebrew
brew install railway

# Verify installation
railway --version
```

## Authentication

```bash
# Login to Railway
railway login

# Check current user
railway whoami

# Logout
railway logout
```

## Project Management

```bash
# Initialize new project
railway init

# Link to existing project
railway link

# Show project status
railway status

# Open project dashboard in browser
railway open

# List all projects
railway list
```

## Deployment

```bash
# Deploy current directory
railway up

# Deploy specific directory
railway up --service my-service

# Redeploy latest deployment
railway redeploy

# View recent deployments
railway deployments
```

## Environment Variables

```bash
# List all variables
railway variables

# Set a variable
railway variables set KEY=value
railway variables set KEY="value with spaces"

# Set multiple variables
railway variables set \
  RUST_LOG=info \
  DATABASE_URL="sqlite:///data/db.sqlite"

# Delete a variable
railway variables delete KEY

# Get specific variable
railway variables get KEY
```

## Logs

```bash
# Stream all logs (follow mode)
railway logs --tail

# Show last 100 lines
railway logs | tail -100

# Filter logs by keyword
railway logs --tail | grep error

# Show build logs
railway logs --type build

# Show deployment logs
railway logs --type deploy
```

## Volumes

```bash
# List all volumes
railway volume list

# Create new volume (use dashboard for better experience)
railway volume create <name>

# Download file from volume
railway volume download <volume-id> <remote-path> <local-path>

# Example: Download database
railway volume download vol_abc123 /data/db.sqlite ./backup.sqlite

# Upload file to volume
railway volume upload <volume-id> <local-path> <remote-path>

# Example: Upload database
railway volume upload vol_abc123 ./backup.sqlite /data/db.sqlite
```

## Service Management

```bash
# List services
railway service list

# Restart service (if supported)
railway service restart

# Stop service (if supported)
railway service stop

# Start service (if supported)
railway service start

# Get service domain
railway domain
```

## Database Plugins

```bash
# Add PostgreSQL
railway add postgresql

# Add MySQL
railway add mysql

# Add MongoDB
railway add mongodb

# Add Redis
railway add redis
```

## Useful Combinations

### Deploy and Monitor

```bash
# Deploy and immediately watch logs
railway up && railway logs --tail
```

### Backup Database

```bash
# List volumes to find ID
railway volume list

# Download database backup
railway volume download vol_abc123xyz /data/db.sqlite ./backup-$(date +%Y%m%d).sqlite
```

### Check Deployment Status

```bash
# Complete status overview
railway status && echo "" && railway domain
```

### Environment Variable Management

```bash
# Export all variables to .env file
railway variables > .env.railway

# Check specific variable
railway variables | grep DATABASE_URL
```

### Quick Redeploy After Code Changes

```bash
# Commit, push, and deploy
git add -A && \
git commit -m "Update" && \
git push && \
railway up
```

## Vibe Kanban Specific Commands

### Initial Setup

```bash
# 1. Install CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Link project
railway link

# 4. Set environment variables
railway variables set DATABASE_URL="sqlite:///data/db.sqlite"
railway variables set RUST_LOG="info"
railway variables set GITHUB_CLIENT_ID="your_client_id"

# 5. Deploy
railway up
```

### Regular Deployment Workflow

```bash
# Using provided scripts (recommended)
./scripts/deploy-to-railway.sh

# Or manually
railway up && railway logs --tail
```

### Database Backup Workflow

```bash
# Using provided scripts (recommended)
./scripts/railway-backup-db.sh

# Or manually
railway volume list  # Get volume ID
railway volume download vol_YOUR_ID /data/db.sqlite ./backup.sqlite
```

### Monitoring

```bash
# Using provided scripts
./scripts/railway-logs.sh          # All logs
./scripts/railway-logs.sh --errors # Errors only
./scripts/railway-logs.sh --database # Database logs

# Or manually
railway logs --tail | grep -i error
railway logs --tail | grep -i database
```

### Database Restore

```bash
# Using provided scripts (recommended)
./scripts/railway-restore-db.sh backup.sqlite

# Or manually (⚠️  DANGEROUS)
railway service stop
railway volume upload vol_YOUR_ID ./backup.sqlite /data/db.sqlite
railway service start
```

## Makefile Shortcuts

If you prefer Make commands, use `Makefile.railway`:

```bash
# Create alias for convenience
alias railway-make='make -f Makefile.railway'

# Then use shortcuts
railway-make setup      # Initial setup
railway-make deploy     # Deploy
railway-make logs       # Stream logs
railway-make backup     # Backup database
railway-make status     # Show status
railway-make help       # Show all commands
```

## Environment Variables Reference

### Essential Variables for Vibe Kanban

```bash
# Database (required if using volume)
DATABASE_URL=sqlite:///data/db.sqlite

# Logging (recommended)
RUST_LOG=info

# GitHub OAuth (optional, for custom app)
GITHUB_CLIENT_ID=Ov23liYourClientId

# Git operations (optional tuning)
GIT_SCAN_TIMEOUT_MS=10000
GIT_SCAN_HARD_TIMEOUT_MS=20000
GIT_SCAN_MAX_DEPTH=3

# Worktree storage (optional)
VIBE_WORKTREE_DIR=/repos/worktrees

# Analytics (optional)
POSTHOG_API_KEY=phc_your_key
POSTHOG_API_ENDPOINT=https://us.i.posthog.com
```

## Troubleshooting Commands

### Check Everything

```bash
railway whoami         # Verify logged in
railway status         # Check project status
railway variables      # List all env vars
railway volume list    # Check volumes
railway logs | tail -50 # Recent logs
railway domain         # Get URL
```

### Debug Deployment Issues

```bash
# Check build logs
railway logs --type build | tail -100

# Check deployment logs
railway logs --type deploy | tail -50

# Check runtime logs
railway logs --tail

# Verify environment
railway variables | grep -E "DATABASE_URL|RUST_LOG|GITHUB"
```

### Check Database

```bash
# Verify volume exists
railway volume list

# Check database size (download and inspect)
railway volume download vol_ID /data/db.sqlite ./test.sqlite
ls -lh ./test.sqlite
sqlite3 ./test.sqlite "SELECT COUNT(*) FROM tasks;"
```

## Common Error Solutions

### "Not logged in"

```bash
railway login
```

### "No project linked"

```bash
railway link
# or
railway init
```

### "Volume not found"

1. Go to Railway dashboard
2. Navigate to your service
3. Create volume in Data/Storage tab
4. Set mount path to `/data`

### "Database file not found"

```bash
# Check DATABASE_URL
railway variables | grep DATABASE_URL

# Should be: sqlite:///data/db.sqlite
# Fix if wrong:
railway variables set DATABASE_URL="sqlite:///data/db.sqlite"

# Redeploy
railway up
```

## Advanced: Railway API

For automation, use Railway API with tokens:

```bash
# Create API token in Railway dashboard
export RAILWAY_TOKEN=your_token_here

# Use with CLI
railway link --token $RAILWAY_TOKEN
railway deploy --token $RAILWAY_TOKEN
```

## Resources

- **Railway CLI Docs**: https://docs.railway.app/develop/cli
- **Railway API**: https://docs.railway.app/reference/api-reference
- **Vibe Kanban Docs**:
  - `RAILWAY_DEPLOYMENT.md`
  - `RAILWAY_ENVIRONMENT.md`
  - `RAILWAY_DATABASE_GUIDE.md`

## Quick Help

```bash
# Get help for any command
railway --help
railway logs --help
railway volume --help
railway variables --help
```

---

**Last Updated**: 2025-11-06
