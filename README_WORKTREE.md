# 🔧 Worktree Development Environment

**YOU ARE WORKING IN A GIT WORKTREE**, not the main repository!

This is an isolated development environment for task: `phase 5 11 test`

## 🚨 CRITICAL: Port Configuration

Your development environment has **dedicated ports** to avoid conflicts:

```
Frontend Dev Server: 4500
Backend Server:      4600
```

### How to Start Development

**Option 1: Start Both Servers (Recommended)**
```bash
pnpm run dev
```

**Option 2: Start Individual Servers**
```bash
# Frontend only
pnpm run frontend:dev

# Backend only
pnpm run backend:dev
```

### Port Information

The ports above are **already configured** in:
- `.dev-ports.json` - Port allocation file
- `.env` - Environment variables
- `vite.config.ts` - Frontend dev server config

**DO NOT:**
- ❌ Manually start servers on port 3000 or 3001
- ❌ Change the ports in `.dev-ports.json`
- ❌ Start servers with explicit port numbers

**DO:**
- ✅ Use `pnpm run dev` (reads ports automatically)
- ✅ Check `.dev-ports.json` if you need to know your ports
- ✅ Access frontend at `http://localhost:4500`

## 📁 Worktree Structure

This worktree is located at:
```
/private/var/folders/ts/3m_pg30j4zl9v3fqrdh4xqc40000gn/T/vibe-kanban-dev/worktrees/ee0c-phase-5-11-test
```

Main repository is at:
```
/private/var/folders/ts/3m_pg30j4zl9v3fqrdh4xqc40000gn/T/vibe-kanban-dev/worktrees/ee0c-phase-5-11-test
```

## 🔄 Database

Your worktree has an **isolated database** copied from `dev_assets_template/`:
```
dev_assets/db.sqlite
```

This prevents you from interfering with the main repository's database.

## 🎯 Your Task

**Task ID:** `emerge/ee0c`
**Task Title:** `phase 5 11 test`
**Branch:** `emerge/ee0c-phase-5-11-test`

## 📚 Common Commands

```bash
# Install dependencies (if needed)
pnpm install

# Start development servers (RECOMMENDED)
pnpm run dev

# Run tests
pnpm run check

# Type generation
pnpm run generate-types

# Database migrations
sqlx migrate run
```

## ⚠️ Important Notes

1. **This is NOT the main repository** - You're in a worktree
2. **Ports are auto-assigned** - Use the ports shown above
3. **Database is isolated** - Safe to experiment
4. **Changes are on a branch** - Will be merged after review

## 🆘 Troubleshooting

**Problem: "Port already in use"**
- Check `.dev-ports.json` for your assigned ports
- Use `pnpm run dev` instead of manual port assignment

**Problem: "Can't find database"**
- Run `pnpm install` to copy template database
- Check that `dev_assets/db.sqlite` exists

**Problem: "Backend not responding"**
- Verify backend is running on 4600
- Check `vite.config.ts` proxy configuration

## 📖 Full Documentation

See [CLAUDE.md](./CLAUDE.md) for complete development guidelines.
