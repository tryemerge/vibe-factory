# Railway Deployment Quick Start

**5-minute guide** to deploy Vibe Kanban to Railway. For comprehensive configuration, see [RAILWAY_ENVIRONMENT.md](../RAILWAY_ENVIRONMENT.md).

---

## Prerequisites

- [ ] GitHub account
- [ ] Railway account ([signup free](https://railway.app))
- [ ] Git repository with Vibe Kanban code

---

## Deployment Options

### Option 1: Deploy with Defaults (Fastest) ⚡

**Timeline**: 5 minutes
**Best for**: Testing, demos, personal use

1. **Connect to Railway**:
   ```
   https://railway.app → New Project → Deploy from GitHub repo
   Select: your-vibe-kanban-repository
   ```

2. **Railway auto-configures everything**:
   - ✅ Detects `Dockerfile`
   - ✅ Sets `PORT` automatically
   - ✅ Provisions unique URL
   - ✅ Uses default GitHub OAuth (Bloop AI's public app)

3. **Deploy**:
   ```
   Railway auto-deploys on push to main branch
   ```

4. **Done!** Visit your Railway URL

**What you get**:
- ✅ Working application immediately
- ✅ GitHub authentication (via Bloop AI's public app)
- ⚠️ Ephemeral database (resets on redeploy)
- ⚠️ No persistence without volume

---

### Option 2: Production Setup with Persistence (Recommended) 🚀

**Timeline**: 15 minutes
**Best for**: Production deployments, data persistence

#### Step 1: Connect Repository (2 min)
```
Railway → New Project → Deploy from GitHub repo
Select: your-vibe-kanban-repository
```

#### Step 2: Add Volume for Database (3 min)
```
Railway → Storage → New Volume
Name: vibe-kanban-data
Mount Path: /data
```

#### Step 3: Configure Environment (5 min)
```
Railway → Variables → Add Variables
```

**Required**:
```bash
DATABASE_URL=sqlite:///data/db.sqlite
```

**Recommended**:
```bash
RUST_LOG=info
GITHUB_CLIENT_ID=Ov23li9bxz3kKfPOIsGm  # Or your custom app
```

#### Step 4: Deploy (5 min)
```
Railway → Deployments → Deploy
Wait for build to complete (~3-5 minutes)
```

#### Step 5: Verify
```bash
curl https://your-app.railway.app/
# Should return 200 OK
```

**What you get**:
- ✅ Persistent database
- ✅ Production-ready
- ✅ Data survives redeployments
- ✅ Ready for custom OAuth (optional)

---

### Option 3: Enterprise Setup with Custom OAuth (Advanced) 🏢

**Timeline**: 30 minutes
**Best for**: Organizations, custom branding, advanced security

Follow **Option 2**, then add:

#### Additional Step: Create GitHub OAuth App

1. **GitHub Developer Settings**:
   ```
   https://github.com/settings/developers
   → New OAuth App
   ```

2. **Configure OAuth App**:
   ```
   Application name: Vibe Kanban Production
   Homepage URL: https://your-app.railway.app
   Authorization callback URL: (leave empty)
   Enable Device Flow: ✓ YES
   ```

3. **Copy Client ID**:
   ```
   Example: Ov23liYourProductionClientId123
   ```

4. **Update Railway Variable**:
   ```
   Railway → Variables → Edit
   GITHUB_CLIENT_ID=Ov23liYourProductionClientId123
   ```

5. **Redeploy**:
   ```
   Railway → Deployments → Deploy
   ```

**What you get**:
- ✅ All of Option 2
- ✅ Your own GitHub OAuth app
- ✅ Custom branding
- ✅ Full control over scopes and permissions

---

## Common Configurations

### Minimal (Ephemeral)
```bash
# No variables needed!
# Railway auto-provides PORT
```
**Use case**: Quick testing, demos

---

### Standard Production (SQLite + Volume)
```bash
DATABASE_URL=sqlite:///data/db.sqlite
RUST_LOG=info
```
**Use case**: Most production deployments

---

### High-Scale (PostgreSQL)
```bash
# Add Railway PostgreSQL plugin first
# DATABASE_URL auto-set by Railway plugin
RUST_LOG=info
GITHUB_CLIENT_ID=<your-app-id>
```
**Use case**: Multiple replicas, high concurrency

---

### Debug Mode
```bash
DATABASE_URL=sqlite:///data/db.sqlite
RUST_LOG=debug  # Verbose logging
GIT_SCAN_TIMEOUT_MS=20000  # Longer timeouts
```
**Use case**: Troubleshooting production issues

---

## Verification Checklist

After deploying, verify everything works:

- [ ] **Health Check**: `curl https://your-app.railway.app/` returns 200 OK
- [ ] **UI Loads**: Visit URL in browser, no errors
- [ ] **GitHub Auth**: Click "Connect GitHub", device flow works
- [ ] **Create Task**: Create test project and task
- [ ] **Persistence** (if using volume): Redeploy, verify data still exists

---

## Troubleshooting

### Build fails with "frontend build errors"
```bash
# Fix TypeScript errors locally first:
cd frontend && pnpm run build
pnpm run generate-types
```

### Server won't start: "Address already in use"
```bash
# Remove PORT variable if you set it:
Railway → Variables → Delete PORT
# Railway manages PORT automatically
```

### Database not found
```bash
# If using volume, verify mount path matches:
DATABASE_URL=sqlite:///data/db.sqlite
Railway → Storage → vibe-kanban-data → Mount path: /data
```

### GitHub OAuth fails
```bash
# Verify Client ID is correct:
Railway → Variables → GITHUB_CLIENT_ID=<correct-value>
# Check GitHub app has Device Flow enabled
```

---

## Next Steps

- **Custom Domain**: Railway → Settings → Domains → Add custom domain
- **Team Access**: Railway → Settings → Members → Invite team
- **Monitoring**: Railway → Deployments → Metrics
- **Backups**: Railway → Storage → Download volume

---

## Complete Documentation

For comprehensive configuration, security best practices, and advanced features:

📖 **[RAILWAY_ENVIRONMENT.md](../RAILWAY_ENVIRONMENT.md)** - Complete production environment guide
📖 **[RAILWAY_DEPLOYMENT.md](../RAILWAY_DEPLOYMENT.md)** - Technical deployment details
📖 **[CLAUDE.md](../CLAUDE.md)** - Development workflow and local setup

---

## Cost Estimates

**Railway Pricing** (as of 2024):
- **Hobby Plan**: $5/month credit (limited resources)
- **Pro Plan**: $20/month minimum (recommended for production)

**Estimated Monthly Costs**:
- **Light usage** (few users, small repos): $20-30/month
- **Moderate usage** (team of 5-10, daily deploys): $40-60/month
- **Heavy usage** (large team, many concurrent agents): $80-120/month

*Includes compute, memory, storage, and bandwidth*

---

## Support

- 🚂 [Railway Docs](https://docs.railway.app)
- 💬 [Railway Discord](https://discord.gg/railway)
- 🐙 [Vibe Kanban Issues](https://github.com/BloopAI/vibe-kanban/issues)
- 📚 [Vibe Kanban Docs](https://vibekanban.com/docs)
