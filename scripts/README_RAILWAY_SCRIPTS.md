# Railway Deployment Scripts

Automation scripts for easy Railway deployment and management.

## Quick Start

```bash
# 1. Initial setup (run once)
./scripts/railway-setup.sh

# 2. Deploy
./scripts/deploy-to-railway.sh

# 3. Monitor
./scripts/railway-logs.sh

# 4. Backup
./scripts/railway-backup-db.sh
```

## Available Scripts

### `railway-setup.sh`

Interactive setup wizard for new Railway projects.

**What it does:**
- Checks Railway CLI installation
- Handles Railway login
- Creates/links Railway project
- Configures database (SQLite volume or PostgreSQL)
- Sets up environment variables
- Configures GitHub OAuth (optional)
- Sets up analytics (optional)

**Usage:**
```bash
./scripts/railway-setup.sh
```

**Run this:** Once when setting up a new Railway deployment.

---

### `deploy-to-railway.sh`

One-command deployment with safety checks.

**What it does:**
- Verifies Railway CLI is ready
- Checks for uncommitted changes
- Validates TypeScript types
- Checks SQLx migrations
- Shows current environment variables
- Deploys to Railway
- Displays deployment URL and status

**Usage:**
```bash
./scripts/deploy-to-railway.sh
```

**Run this:** Every time you want to deploy changes to Railway.

---

### `railway-logs.sh`

Stream and filter Railway logs.

**What it does:**
- Streams logs in real-time
- Filters logs by type (errors, database, migrations, git)
- Shows last N lines before streaming
- Colorized output for better readability

**Usage:**
```bash
# Stream all logs
./scripts/railway-logs.sh

# Show last 100 lines then stream
./scripts/railway-logs.sh --tail 100

# Only show errors
./scripts/railway-logs.sh --errors

# Only show database logs
./scripts/railway-logs.sh --database

# Only show migration logs
./scripts/railway-logs.sh --migrations

# Only show git-related logs
./scripts/railway-logs.sh --git

# Show build logs
./scripts/railway-logs.sh --build

# Show deployment logs
./scripts/railway-logs.sh --deploy
```

**Run this:** Anytime you want to monitor your Railway deployment.

---

### `railway-backup-db.sh`

Download database backup from Railway volume.

**What it does:**
- Lists available Railway volumes
- Downloads database file from `/data/db.sqlite`
- Saves with timestamp
- Validates SQLite file integrity
- Shows file size and table count

**Usage:**
```bash
# Auto-named backup
./scripts/railway-backup-db.sh

# Custom filename
./scripts/railway-backup-db.sh --output my-backup.sqlite
```

**Backups saved to:** `railway-backups/railway-backup-YYYYMMDD-HHMMSS.sqlite`

**Run this:**
- Before deploying major changes
- Daily (set up automation)
- Before restoring from backup
- Before database migrations

---

### `railway-restore-db.sh`

Restore database from backup.

**⚠️  WARNING:** This will overwrite the existing database!

**What it does:**
- Validates backup file
- Stops Railway service
- Uploads backup to Railway volume
- Restarts service
- Monitors startup

**Usage:**
```bash
./scripts/railway-restore-db.sh path/to/backup.sqlite
```

**Example:**
```bash
./scripts/railway-restore-db.sh railway-backups/railway-backup-20251106-123456.sqlite
```

**Safety features:**
- Requires typing "RESTORE" to confirm
- Shows file size and validation
- Stops service before upload
- Provides rollback instructions

**Run this:** Only when you need to restore from a backup after data loss or corruption.

---

## Makefile Shortcuts

For convenience, use `Makefile.railway`:

```bash
# Create alias
alias railway-make='make -f Makefile.railway'

# Common commands
railway-make setup      # Initial setup
railway-make deploy     # Deploy
railway-make logs       # Stream logs
railway-make logs-errors # Error logs only
railway-make backup     # Backup database
railway-make status     # Show status
railway-make open       # Open dashboard
railway-make help       # Show all commands
```

### Restore with Makefile

```bash
make -f Makefile.railway restore BACKUP_FILE=railway-backups/backup.sqlite
```

## Prerequisites

All scripts require:
- **Railway CLI** installed: `npm install -g @railway/cli`
- **Railway account** created: https://railway.app
- **Logged in**: `railway login`

Some scripts also require:
- `sqlite3` for database validation (optional but recommended)
- `git` for checking uncommitted changes

## Installation

Scripts are already in the repository. Just make sure they're executable:

```bash
chmod +x scripts/railway-*.sh
```

## Troubleshooting

### "Railway CLI not found"

```bash
# Install Railway CLI
npm install -g @railway/cli

# Or via Homebrew
brew install railway
```

### "Not logged in to Railway"

```bash
railway login
```

### "Not linked to a Railway project"

```bash
# Link to existing project
railway link

# Or run setup script
./scripts/railway-setup.sh
```

### "Volume not found"

1. Go to Railway dashboard
2. Navigate to your service
3. Go to "Data" or "Storage" tab
4. Create new volume
5. Set mount path to `/data`
6. Set DATABASE_URL: `sqlite:///data/db.sqlite`

### Script execution errors

Make sure scripts are executable:
```bash
chmod +x scripts/railway-*.sh
```

## Documentation

- **[RAILWAY_DEPLOYMENT.md](../RAILWAY_DEPLOYMENT.md)** - Complete deployment guide
- **[RAILWAY_ENVIRONMENT.md](../RAILWAY_ENVIRONMENT.md)** - Environment variables reference
- **[RAILWAY_DATABASE_GUIDE.md](../RAILWAY_DATABASE_GUIDE.md)** - Database management guide
- **[RAILWAY_CLI_REFERENCE.md](../RAILWAY_CLI_REFERENCE.md)** - Railway CLI quick reference

## Workflow Examples

### Initial Deployment

```bash
# 1. Setup (interactive)
./scripts/railway-setup.sh

# 2. Deploy
./scripts/deploy-to-railway.sh

# 3. Monitor logs
./scripts/railway-logs.sh

# 4. Create first backup
./scripts/railway-backup-db.sh
```

### Regular Deployment

```bash
# 1. Make code changes
git add .
git commit -m "Update feature"

# 2. Deploy
./scripts/deploy-to-railway.sh

# 3. Monitor deployment
./scripts/railway-logs.sh --tail 50
```

### Debugging Issues

```bash
# Check errors
./scripts/railway-logs.sh --errors

# Check database logs
./scripts/railway-logs.sh --database

# Check status
railway status

# Check environment
railway variables
```

### Database Maintenance

```bash
# Create backup before changes
./scripts/railway-backup-db.sh

# ... make changes ...

# If something goes wrong, restore
./scripts/railway-restore-db.sh railway-backups/backup.sqlite
```

## Automation

### Daily Backups with Cron

```bash
# Add to crontab
0 2 * * * cd /path/to/vibe-kanban && ./scripts/railway-backup-db.sh
```

### GitHub Actions

See `RAILWAY_DATABASE_GUIDE.md` for GitHub Actions backup workflow example.

## Support

For issues with:
- **Scripts**: Open GitHub issue
- **Railway**: https://docs.railway.app or Railway Discord
- **Deployment**: See `RAILWAY_DEPLOYMENT.md`

---

**Last Updated**: 2025-11-06
