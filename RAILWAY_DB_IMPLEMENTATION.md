# Railway Database Persistence - Implementation Summary

**Status:** ✅ Complete
**Strategy:** SQLite + Railway Volume
**Date:** 2025-11-06

---

## What Was Implemented

### 1. **Automatic Database Initialization** ✅

**File:** `scripts/railway-entrypoint.sh`

- Runs on every Railway deployment
- Detects if database exists at `/data/db.sqlite`
- If missing: Copies template from `dev_assets_template/db.sqlite`
- If exists: Uses existing database (preserves data)
- Creates `/data` directory if needed

**Key features:**
- ✅ Graceful error handling
- ✅ Informative logging for debugging
- ✅ Safe for repeated runs

### 2. **Dockerfile Updates** ✅

**Changes made:**

```dockerfile
# Added template database to runtime image
COPY --from=builder /app/dev_assets_template /app/dev_assets_template

# Added entrypoint script
COPY scripts/railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh
RUN chmod +x /usr/local/bin/railway-entrypoint.sh

# Created /data directory for volume mount
RUN mkdir -p /repos /data && \
    chown -R appuser:appgroup /repos /data /app

# Updated entrypoint to run initialization script
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/railway-entrypoint.sh"]
CMD ["server"]
```

### 3. **Railway Configuration** ✅

**File:** `railway.toml`

Added comprehensive documentation for:
- Volume creation steps
- Environment variable setup
- Migration behavior
- Reference to detailed guide

### 4. **Comprehensive Documentation** ✅

**File:** `RAILWAY_DATABASE_GUIDE.md`

Complete guide covering:
- Quick start (5-minute setup)
- Architecture overview
- Migration lifecycle
- Backup procedures (manual + automated)
- Restore procedures
- Troubleshooting common issues
- PostgreSQL migration path

### 5. **Testing** ✅

**File:** `test-railway-setup.sh`

Verified:
- ✅ Database initializes correctly on first run
- ✅ Existing database is preserved on subsequent runs
- ✅ Template database is copied successfully
- ✅ Directory creation works properly

---

## How It Works

### Deployment Flow

```
┌─────────────────────────────────────────────────┐
│ 1. Railway Builds Docker Image                 │
│    - Includes template DB in image              │
│    - Includes entrypoint script                 │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ 2. Container Starts                             │
│    - Runs: railway-entrypoint.sh                │
│    - Checks: Does /data/db.sqlite exist?        │
│      ├─ NO:  Copy template → /data/db.sqlite    │
│      └─ YES: Use existing database              │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ 3. Application Starts (server binary)          │
│    - Connects to DATABASE_URL                   │
│    - Runs migrations automatically              │
│    - Starts web server                          │
└─────────────────────────────────────────────────┘
```

### Why This Approach?

**Automatic Migrations:**
- Already implemented in `crates/db/src/lib.rs:24,73`
- Runs via `sqlx::migrate!("./migrations").run(&pool)`
- No additional migration tooling needed
- Safe: SQLx tracks which migrations have run

**Template Database:**
- Provides seed data for first deploy
- Includes default projects, agents, tags
- Faster than running SQL inserts manually
- Consistent initial state

**Volume Persistence:**
- Railway volumes persist across deploys
- Data survives container restarts
- Easy backup/restore via Railway CLI
- Cost-effective (free tier available)

---

## Setup Instructions for Railway

### Prerequisites

- Railway account
- Railway CLI installed (optional but recommended)
- Project deployed to Railway

### Step 1: Create Volume

**Via Railway Dashboard:**
1. Go to your service
2. Navigate to **Data** or **Storage** tab
3. Click **"New Volume"**
4. Set mount path: `/data`
5. Create volume

**Via Railway CLI:**
```bash
railway volume create vibe-kanban-data
railway volume attach vibe-kanban-data --mount-path /data
```

### Step 2: Set Environment Variable

**Via Railway Dashboard:**
1. Go to **Variables** tab
2. Add: `DATABASE_URL=sqlite:///data/db.sqlite`

**Via Railway CLI:**
```bash
railway variables set DATABASE_URL="sqlite:///data/db.sqlite"
```

### Step 3: Deploy

```bash
# Push changes
git push origin master

# Or use Railway CLI
railway up
```

### Step 4: Verify

```bash
# Check logs
railway logs --tail

# Look for:
# ✅ Database initialized successfully
# 🚀 Starting server...
```

---

## Backup Strategy

### Manual Backup

```bash
# Download database
railway volume download <volume-id> /data/db.sqlite ./backup.sqlite

# Verify
ls -lh backup.sqlite
```

### Automated Backup (Recommended)

**Option 1: GitHub Actions**

See `RAILWAY_DATABASE_GUIDE.md` for complete GitHub Actions workflow.

**Option 2: Railway Scheduled Job**

Create separate service that runs periodic backups and uploads to S3/GCS.

**Best Practices:**
- 📅 Daily backups for production
- 🔒 Encrypt backups
- 🌍 Store off-Railway (S3, GitHub Artifacts)
- 🧪 Test restores monthly

---

## Troubleshooting

### Database Not Persisting?

**Check:**
1. Volume mounted at `/data`: `railway volumes`
2. `DATABASE_URL=sqlite:///data/db.sqlite`
3. Logs show: `/data/db.sqlite` (not `/app/dev_assets/db.sqlite`)

### Migration Errors?

**Check:**
1. SQLx cache is up-to-date:
   ```bash
   DATABASE_URL="sqlite://dev_assets/db.sqlite" cargo sqlx prepare --workspace
   ```
2. Migration syntax is valid (test locally first)
3. Logs for specific error messages

### Disk Space Issues?

**Check:**
1. Volume size in Railway dashboard
2. Consider increasing volume size
3. Run `VACUUM` to optimize database

---

## Migration to PostgreSQL

When you need:
- Database > 1GB
- Concurrent writes
- Horizontal scaling
- Automatic backups

**Steps:**
1. Add Railway PostgreSQL plugin
2. Export SQLite data: `sqlite3 export.sqlite .dump > data.sql`
3. Update migrations for PostgreSQL syntax
4. Import data: `psql $DATABASE_URL < data.sql`
5. Deploy (Railway auto-updates `DATABASE_URL`)

See `RAILWAY_DATABASE_GUIDE.md` for complete migration guide.

---

## Files Changed

| File | Status | Description |
|------|--------|-------------|
| `scripts/railway-entrypoint.sh` | ✅ New | Database initialization script |
| `Dockerfile` | ✅ Modified | Added template DB, entrypoint, /data directory |
| `railway.toml` | ✅ Modified | Added volume setup documentation |
| `RAILWAY_DATABASE_GUIDE.md` | ✅ New | Comprehensive database management guide |
| `RAILWAY_DB_IMPLEMENTATION.md` | ✅ New | This implementation summary |
| `test-railway-setup.sh` | ✅ New | Local testing script |

---

## Testing Results

**Local Testing:** ✅ Passed

```
✅ Database initialization (first run)
✅ Database reuse (subsequent runs)
✅ Template copying works
✅ Directory creation works
```

**Production Testing Checklist:**

After deploying to Railway, verify:

- [ ] Service starts successfully
- [ ] Logs show: `✅ Database initialized successfully`
- [ ] Can create tasks/projects
- [ ] Data persists after redeploy
- [ ] Can download backup via Railway CLI
- [ ] Can restore from backup

---

## Next Steps

1. ✅ **Deploy to Railway**
   ```bash
   git push origin master
   ```

2. ✅ **Create Volume**
   - Railway Dashboard → Storage → New Volume → Mount: `/data`

3. ✅ **Set Environment Variable**
   - `DATABASE_URL=sqlite:///data/db.sqlite`

4. ✅ **Monitor First Deploy**
   ```bash
   railway logs --tail
   ```

5. ✅ **Test Functionality**
   - Create a task
   - Redeploy
   - Verify task still exists

6. ✅ **Set Up Backups**
   - Implement daily backup strategy
   - Test restore procedure
   - Document backup locations

7. **Optional: PostgreSQL Migration**
   - When database grows
   - Follow `RAILWAY_DATABASE_GUIDE.md`

---

## Support

**Documentation:**
- Full guide: `RAILWAY_DATABASE_GUIDE.md`
- Railway config: `railway.toml`
- Environment vars: `.env.production.example`

**Issues:**
- Railway Support: https://discord.gg/railway
- Project Issues: https://github.com/BloopAI/vibe-kanban/issues

---

## Summary

✅ **Strategy Chosen:** SQLite + Railway Volume
✅ **Automatic Initialization:** Implemented
✅ **Automatic Migrations:** Already working
✅ **Backup/Restore:** Documented
✅ **Testing:** Passed
✅ **Documentation:** Complete

**Ready for production deployment!** 🚀
