# Railway Database Management Guide

Complete guide for managing database persistence, migrations, backups, and disaster recovery on Railway.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Initial Setup](#initial-setup)
- [How Migrations Work](#how-migrations-work)
- [Backup Procedures](#backup-procedures)
- [Restore Procedures](#restore-procedures)
- [Troubleshooting](#troubleshooting)
- [Migration to PostgreSQL](#migration-to-postgresql)

---

## Quick Start

### Minimal Setup (5 minutes)

```bash
# 1. Create Railway volume (via dashboard)
# - Go to your service → Data/Storage → New Volume
# - Mount path: /data
# - Size: 1GB (adjust as needed)

# 2. Set environment variable in Railway dashboard
DATABASE_URL=sqlite:///data/db.sqlite

# 3. Deploy
railway up

# Done! Database will initialize automatically on first deploy.
```

---

## Architecture Overview

### How Database Persistence Works

```
┌─────────────────────────────────────────────────────────────┐
│ Railway Deployment Flow                                      │
└─────────────────────────────────────────────────────────────┘

1. Docker Build
   └─> Includes template database: /app/dev_assets_template/db.sqlite
   └─> Includes entrypoint script: /usr/local/bin/railway-entrypoint.sh

2. Container Start (via entrypoint.sh)
   └─> Check if /data/db.sqlite exists
       ├─> NO: Copy template → /data/db.sqlite
       └─> YES: Use existing database

3. Application Start (Rust binary)
   └─> Connect to database (DATABASE_URL)
   └─> Run migrations automatically (sqlx::migrate!())
   └─> Start web server
```

### Key Files

| File | Purpose |
|------|---------|
| `scripts/railway-entrypoint.sh` | Database initialization on first deploy |
| `dev_assets_template/db.sqlite` | Template database with seed data |
| `crates/db/migrations/*.sql` | Database schema migrations |
| `crates/db/src/lib.rs:24,73` | Automatic migration execution |

### Automatic Migrations

**Critical:** Migrations run automatically every time the application starts.

```rust
// In crates/db/src/lib.rs
let pool = SqlitePool::connect_with(options).await?;
sqlx::migrate!("./migrations").run(&pool).await?; // ← Automatic!
```

This means:
- ✅ **No manual migration commands needed**
- ✅ **New deployments automatically update schema**
- ✅ **Safe: SQLx tracks applied migrations**
- ⚠️ **Warning: Destructive migrations are permanent!**

---

## Initial Setup

### Step 1: Create Railway Volume

**Via Railway Dashboard:**

1. Navigate to your Railway project
2. Click on the `vibe-kanban` service
3. Go to **Data** or **Storage** tab
4. Click **"New Volume"** or **"+ Volume"**
5. Configure volume:
   - **Mount Path:** `/data`
   - **Size:** Start with 1GB (increase later if needed)
6. Click **"Add"** or **"Create"**

**Via Railway CLI:**

```bash
railway volume create vibe-kanban-data
railway volume attach vibe-kanban-data --mount-path /data
```

### Step 2: Set Environment Variable

**Via Railway Dashboard:**

1. Go to your service → **Variables** tab
2. Click **"New Variable"**
3. Add:
   - **Key:** `DATABASE_URL`
   - **Value:** `sqlite:///data/db.sqlite`
4. Click **"Add"**

**Via Railway CLI:**

```bash
railway variables set DATABASE_URL="sqlite:///data/db.sqlite"
```

### Step 3: Deploy

```bash
# Via Railway CLI
railway up

# Via Git push (if connected to GitHub)
git push origin master
```

### Step 4: Verify Setup

**Check logs for successful initialization:**

```bash
railway logs
```

You should see:

```
🚀 Starting Vibe Kanban Railway deployment...
📊 Database URL: sqlite:///data/db.sqlite
📁 Database path: /data/db.sqlite
🆕 Database not found, initializing from template...
📋 Copying template database...
✅ Database initialized successfully
🎯 Database initialization complete!
🔄 Migrations will be applied automatically by the application
🚀 Starting server...
```

**On subsequent deploys, you'll see:**

```
✅ Database already exists at: /data/db.sqlite
   Database size: 4.2M
```

---

## How Migrations Work

### Migration Lifecycle

1. **Developer creates migration:**
   ```bash
   # Local development
   touch crates/db/migrations/20251107000000_add_new_feature.sql
   ```

2. **Developer tests locally:**
   ```bash
   DATABASE_URL="sqlite://dev_assets/db.sqlite" sqlx migrate run
   ```

3. **Update SQLx cache (CRITICAL):**
   ```bash
   DATABASE_URL="sqlite://dev_assets/db.sqlite" cargo sqlx prepare --workspace
   git add .sqlx/
   ```

4. **Deploy to Railway:**
   ```bash
   git push origin master
   # Railway builds and deploys
   ```

5. **Automatic migration on startup:**
   - Application connects to database
   - SQLx checks `_sqlx_migrations` table
   - Applies any pending migrations
   - Server starts

### Migration Safety

**Safe migrations:**
- ✅ `CREATE TABLE`
- ✅ `ALTER TABLE ADD COLUMN` (with defaults)
- ✅ `CREATE INDEX`
- ✅ `INSERT` (seed data)

**Dangerous migrations:**
- ⚠️ `DROP TABLE` (data loss!)
- ⚠️ `DROP COLUMN` (data loss!)
- ⚠️ `ALTER TABLE ... NOT NULL` (may fail on existing data)

**Best practices:**
- Always test migrations locally first
- Create backup before deploying destructive migrations
- Use transactions where possible
- Consider multi-step migrations for complex changes

### Rollback Strategy

SQLx migrations are **forward-only** (no built-in rollback).

**To rollback a migration:**

1. **Restore database from backup** (see [Restore Procedures](#restore-procedures))
2. **Revert code changes:**
   ```bash
   git revert <commit-hash>
   git push origin master
   ```

---

## Backup Procedures

### Manual Backup via Railway CLI

**Prerequisites:**
- Install Railway CLI: `npm install -g @railway/cli`
- Login: `railway login`
- Link project: `railway link`

**Download database:**

```bash
# Find your volume ID
railway volumes

# Download database file
railway volume download <volume-id> /data/db.sqlite ./backup-$(date +%Y%m%d-%H%M%S).sqlite

# Verify backup
ls -lh backup-*.sqlite
```

**Example:**

```bash
$ railway volumes
┌─────────────────────┬──────────────────┬─────────┬──────────┐
│ ID                  │ Name             │ Size    │ Mount    │
├─────────────────────┼──────────────────┼─────────┼──────────┤
│ vol_abc123xyz       │ vibe-kanban-data │ 1.5 GB  │ /data    │
└─────────────────────┴──────────────────┴─────────┴──────────┘

$ railway volume download vol_abc123xyz /data/db.sqlite ./backup-20251106.sqlite
✓ Downloaded /data/db.sqlite to ./backup-20251106.sqlite

$ ls -lh backup-20251106.sqlite
-rw-r--r--  1 user  staff   4.2M Nov  6 15:30 backup-20251106.sqlite
```

### Manual Backup via Railway Dashboard

1. Go to your service → **Data/Storage** tab
2. Click on the `vibe-kanban-data` volume
3. Click **"Download"** or **"Backup"**
4. Select file: `/data/db.sqlite`
5. Download to your local machine

### Automated Backup Strategy

**Option 1: Railway Backup Plugin (Recommended)**

Railway offers automatic backups for volumes (check Railway docs for latest features).

**Option 2: Scheduled Railway Job**

Create a separate Railway service that runs periodic backups:

```dockerfile
# Dockerfile.backup
FROM alpine:latest
RUN apk add --no-cache sqlite

COPY backup-script.sh /backup-script.sh
RUN chmod +x /backup-script.sh

CMD ["/backup-script.sh"]
```

```bash
# backup-script.sh
#!/bin/sh
sqlite3 /data/db.sqlite ".backup /backups/db-$(date +%Y%m%d-%H%M%S).sqlite"
# Upload to S3, GCS, or other cloud storage
```

**Option 3: GitHub Actions Backup**

```yaml
# .github/workflows/backup-railway-db.yml
name: Backup Railway Database
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Railway CLI
        run: npm install -g @railway/cli
      - name: Download Database
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway link ${{ secrets.RAILWAY_PROJECT_ID }}
          railway volume download ${{ secrets.VOLUME_ID }} /data/db.sqlite ./backup.sqlite
      - name: Upload to Artifact
        uses: actions/upload-artifact@v3
        with:
          name: database-backup-${{ github.run_number }}
          path: backup.sqlite
          retention-days: 30
```

### Backup Best Practices

- 📅 **Daily backups** for production systems
- 🔒 **Encrypt backups** before storing
- 🌍 **Store backups off-Railway** (S3, GitHub, etc.)
- 🧪 **Test restores** periodically
- 📝 **Document backup locations**
- ⏰ **Automate backups** (don't rely on manual process)

---

## Restore Procedures

### Restore from Backup via Railway CLI

**Prerequisites:**
- Have a backup file (`backup.sqlite`)
- Railway CLI installed and linked

**Upload database:**

```bash
# 1. Stop the service (optional, but recommended)
railway service stop

# 2. Upload backup to volume
railway volume upload <volume-id> ./backup.sqlite /data/db.sqlite

# 3. Restart service
railway service start

# 4. Verify logs
railway logs --tail
```

**Example:**

```bash
$ railway service stop
✓ Service stopped

$ railway volume upload vol_abc123xyz ./backup-20251106.sqlite /data/db.sqlite
✓ Uploaded ./backup-20251106.sqlite to /data/db.sqlite

$ railway service start
✓ Service started

$ railway logs --tail
[INFO] Server running on http://0.0.0.0:3000
```

### Restore via Railway Dashboard

**Note:** Railway dashboard may not support direct file uploads. Use CLI method above.

### Emergency Restore (Database Corruption)

If database is corrupted and service won't start:

```bash
# 1. Force stop service
railway service stop --force

# 2. SSH into container (if Railway supports it) or use CLI
railway volume upload <volume-id> ./backup.sqlite /data/db.sqlite

# 3. Restart
railway service start

# 4. Monitor startup
railway logs --tail
```

### Disaster Recovery Checklist

**If production database is lost or corrupted:**

- [ ] **Don't panic** - Railway volumes persist across deploys
- [ ] Stop the service: `railway service stop`
- [ ] Check if backup exists: `railway volume download ...`
- [ ] If backup is good, proceed with restore
- [ ] If no backup, check Railway volume snapshots (if available)
- [ ] Upload last known good backup
- [ ] Restart service
- [ ] Verify data integrity
- [ ] Check logs for errors
- [ ] Test critical workflows
- [ ] Document incident and improve backup strategy

---

## Troubleshooting

### Problem: Database Not Persisting Across Deploys

**Symptoms:**
- Database resets to template on every deploy
- Tasks/projects disappear after redeploy

**Diagnosis:**

```bash
# Check if volume is mounted
railway logs | grep "Database path"

# Should show: /data/db.sqlite
# NOT: /app/dev_assets/db.sqlite
```

**Solution:**

1. Verify volume is created and mounted at `/data`
2. Check `DATABASE_URL` environment variable:
   ```bash
   railway variables
   ```
3. Ensure it's set to: `sqlite:///data/db.sqlite`

### Problem: Migrations Failing on Startup

**Symptoms:**
- Service crashes on startup
- Logs show: `Error: Sqlx(Migrate(...))`

**Diagnosis:**

```bash
railway logs | grep -i "migration\|sqlx"
```

**Common causes:**

1. **Checksum mismatch:**
   ```
   Error: Sqlx(Migrate(VersionMismatch(20251107000000)))
   ```

   **Solution:** Update SQLx cache locally and redeploy:
   ```bash
   DATABASE_URL="sqlite://dev_assets/db.sqlite" cargo sqlx prepare --workspace
   git add .sqlx/
   git commit -m "Update SQLx cache"
   git push origin master
   ```

2. **Migration syntax error:**
   ```
   Error: Sqlx(Migrate(Execute(...)))
   ```

   **Solution:** Fix migration file syntax, test locally, redeploy:
   ```bash
   # Test migration
   DATABASE_URL="sqlite://dev_assets/db.sqlite" sqlx migrate run

   # If successful, commit and push
   git add crates/db/migrations/
   git commit -m "Fix migration syntax"
   git push origin master
   ```

### Problem: Disk Space Running Out

**Symptoms:**
- `SQLITE_FULL` errors in logs
- Writes failing

**Diagnosis:**

```bash
railway logs | grep -i "disk\|space\|full"

# Check volume size in dashboard
railway volumes
```

**Solution:**

1. **Increase volume size** via Railway dashboard:
   - Go to Data/Storage → Click volume → Resize

2. **Clean up old data** (if appropriate):
   ```sql
   -- Example: Delete old execution logs
   DELETE FROM execution_process_logs WHERE created_at < datetime('now', '-30 days');
   VACUUM;
   ```

3. **Optimize database:**
   ```bash
   # Via Railway shell (if available)
   sqlite3 /data/db.sqlite "VACUUM;"
   ```

### Problem: Slow Database Performance

**Symptoms:**
- Slow API responses
- High latency

**Diagnosis:**

```bash
# Check database file size
railway logs | grep "Database size"

# Enable query logging (local testing)
RUST_LOG=sqlx=debug railway logs
```

**Solutions:**

1. **Add indexes** (requires new migration):
   ```sql
   CREATE INDEX idx_tasks_project_id ON tasks(project_id);
   CREATE INDEX idx_execution_processes_task_attempt_id ON execution_processes(task_attempt_id);
   ```

2. **Run VACUUM** to optimize:
   ```bash
   sqlite3 /data/db.sqlite "VACUUM;"
   ```

3. **Consider PostgreSQL** for larger datasets (see next section)

---

## Migration to PostgreSQL

If you outgrow SQLite, migrate to Railway's PostgreSQL:

### Why Migrate?

**Move to PostgreSQL when:**
- ✅ Database > 1GB
- ✅ Need concurrent writes
- ✅ Want automatic backups
- ✅ Need better performance
- ✅ Planning horizontal scaling

### Migration Steps

**1. Install PostgreSQL Plugin:**

```bash
# Via CLI
railway add postgresql

# Via Dashboard: New → Database → PostgreSQL
```

**2. Export SQLite data:**

```bash
# Download current database
railway volume download <volume-id> /data/db.sqlite ./export.sqlite

# Convert to SQL dump
sqlite3 export.sqlite .dump > data.sql
```

**3. Update migrations for PostgreSQL:**

Some SQLite-specific syntax may need changes:

| SQLite | PostgreSQL |
|--------|------------|
| `AUTOINCREMENT` | `SERIAL` or `BIGSERIAL` |
| `TEXT` | `TEXT` or `VARCHAR` |
| `INTEGER PRIMARY KEY` | `SERIAL PRIMARY KEY` |
| `DATETIME('now')` | `NOW()` |

**4. Update code (minimal changes):**

```rust
// crates/db/src/lib.rs
// SQLx supports both! Just change DATABASE_URL

// No code changes needed - SQLx abstracts this!
```

**5. Import data to PostgreSQL:**

```bash
# Get PostgreSQL connection string from Railway
railway variables | grep DATABASE_URL

# Import data
psql $DATABASE_URL < data.sql
```

**6. Update environment variable:**

Railway auto-sets `DATABASE_URL` when PostgreSQL plugin is added.

**7. Deploy and test:**

```bash
railway up
railway logs --tail
```

### PostgreSQL Best Practices

- ✅ Use Railway's automatic backups
- ✅ Set up connection pooling
- ✅ Enable query logging for debugging
- ✅ Monitor database metrics
- ✅ Regular VACUUM and ANALYZE

---

## Summary Checklist

### Initial Setup ✓
- [ ] Create Railway volume (`/data`)
- [ ] Set `DATABASE_URL=sqlite:///data/db.sqlite`
- [ ] Deploy and verify initialization
- [ ] Test creating tasks/projects
- [ ] Verify data persists after redeploy

### Backup Strategy ✓
- [ ] Install Railway CLI
- [ ] Test manual backup procedure
- [ ] Set up automated backups (daily)
- [ ] Store backups off-Railway
- [ ] Document backup locations
- [ ] Test restore procedure

### Monitoring ✓
- [ ] Set up Railway alerts for service failures
- [ ] Monitor disk usage
- [ ] Check migration logs on each deploy
- [ ] Review database size regularly
- [ ] Plan for PostgreSQL migration if needed

---

## Additional Resources

- **Railway Docs:** https://docs.railway.app/
- **SQLx Documentation:** https://github.com/launchbadge/sqlx
- **SQLite Documentation:** https://www.sqlite.org/docs.html
- **Vibe Kanban Issues:** https://github.com/BloopAI/vibe-kanban/issues

For questions or issues, open a GitHub issue or check Railway community forums.
