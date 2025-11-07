<p align="center">
  <a href="https://vibekanban.com">
    <picture>
      <source srcset="frontend/public/vibe-kanban-logo-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="frontend/public/vibe-kanban-logo.svg" media="(prefers-color-scheme: light)">
      <img src="frontend/public/vibe-kanban-logo.svg" alt="Vibe Kanban Logo">
    </picture>
  </a>
</p>

<p align="center">Get 10X more out of Claude Code, Gemini CLI, Codex, Amp and other coding agents...</p>
<p align="center">
  <a href="https://www.npmjs.com/package/vibe-kanban"><img alt="npm" src="https://img.shields.io/npm/v/vibe-kanban?style=flat-square" /></a>
  <a href="https://github.com/BloopAI/vibe-kanban/blob/main/.github/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/BloopAI/vibe-kanban/.github%2Fworkflows%2Fpublish.yml" /></a>
  <a href="https://deepwiki.com/BloopAI/vibe-kanban"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

![](frontend/public/vibe-kanban-screenshot-overview.png)

## Overview

AI coding agents are increasingly writing the world's code and human engineers now spend the majority of their time planning, reviewing, and orchestrating tasks. Vibe Kanban streamlines this process, enabling you to:

- Easily switch between different coding agents
- Orchestrate the execution of multiple coding agents in parallel or in sequence
- Quickly review work and start dev servers
- Track the status of tasks that your coding agents are working on
- Centralise configuration of coding agent MCP configs

You can watch a video overview [here](https://youtu.be/TFT3KnZOOAk).

## Installation

Make sure you have authenticated with your favourite coding agent. A full list of supported coding agents can be found in the [docs](https://vibekanban.com/docs). Then in your terminal run:

```bash
npx vibe-kanban
```

## Documentation

Please head to the [website](https://vibekanban.com/docs) for the latest documentation and user guides.

## Railway Deployment

Deploy Vibe Kanban to Railway for access from anywhere (mobile, tablet, etc.).

### Quick Deploy

**Option 1: One-Click Setup (Recommended)**

Use our automated setup script for the easiest deployment experience:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Run automated setup
./scripts/railway-setup.sh

# Deploy
./scripts/deploy-to-railway.sh
```

**Option 2: Manual Setup**

1. Create new project on [Railway](https://railway.app)
2. Deploy from GitHub repo → Select your Vibe Kanban repository
3. Railway auto-detects the Dockerfile and deploys
4. (Optional) Add a volume for database persistence:
   - Storage → New Volume → Mount at `/data`
   - Set `DATABASE_URL=sqlite:///data/db.sqlite`

### Quick Start Guide

For a 5-minute deployment walkthrough, see **[docs/railway-quickstart.md](docs/railway-quickstart.md)**.

### Complete Documentation

- **[RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)** - Comprehensive deployment guide with automation scripts
- **[RAILWAY_ENVIRONMENT.md](RAILWAY_ENVIRONMENT.md)** - Complete environment variable reference
- **[RAILWAY_DATABASE_GUIDE.md](RAILWAY_DATABASE_GUIDE.md)** - Database setup and backup procedures
- **[RAILWAY_CLI_REFERENCE.md](RAILWAY_CLI_REFERENCE.md)** - Railway CLI command reference

### Available Automation Scripts

| Script | Purpose |
|--------|---------|
| `railway-setup.sh` | Interactive setup for new Railway projects |
| `deploy-to-railway.sh` | One-command deployment with safety checks |
| `railway-logs.sh` | Stream and filter logs |
| `railway-backup-db.sh` | Download database backup |
| `railway-restore-db.sh` | Restore database from backup |

### Key Features

✅ **Zero-config deployment** - Works with Railway defaults
✅ **Persistent database** - Optional volume for data persistence
✅ **Automatic HTTPS** - Railway provides SSL certificates
✅ **GitHub authentication** - Device Flow OAuth built-in
✅ **Docker-based** - Uses existing Dockerfile

### Cost Estimate

- **Hobby Plan**: $5/month credit (testing/demos)
- **Pro Plan**: $20-60/month (recommended for production)

See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for detailed resource requirements and cost breakdown.

## Support

We use [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions) for feature requests. Please open a discussion to create a feature request. For bugs please open an issue on this repo.

## Contributing

We would prefer that ideas and changes are first raised with the core team via [GitHub Discussions](https://github.com/BloopAI/vibe-kanban/discussions) or Discord, where we can discuss implementation details and alignment with the existing roadmap. Please do not open PRs without first discussing your proposal with the team.

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (>=18)
- [pnpm](https://pnpm.io/) (>=8)

Additional development tools:
```bash
cargo install cargo-watch
cargo install sqlx-cli
```

Install dependencies:
```bash
pnpm i
```

### Running the dev server

```bash
pnpm run dev
```

This will start the backend. A blank DB will be copied from the `dev_assets_seed` folder.

### Building the frontend

To build just the frontend:

```bash
cd frontend
pnpm build
```

### Build from source

1. Run `build-npm-package.sh`
2. In the `npx-cli` folder run `npm pack`
3. You can run your build with `npx [GENERATED FILE].tgz`


### Environment Variables

The following environment variables can be configured at build time or runtime:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `GITHUB_CLIENT_ID` | Build-time | `Ov23li9bxz3kKfPOIsGm` | GitHub OAuth app client ID for authentication |
| `POSTHOG_API_KEY` | Build-time | Empty | PostHog analytics API key (disables analytics if empty) |
| `POSTHOG_API_ENDPOINT` | Build-time | Empty | PostHog analytics endpoint (disables analytics if empty) |
| `BACKEND_PORT` | Runtime | `0` (auto-assign) | Backend server port |
| `FRONTEND_PORT` | Runtime | `3000` | Frontend development server port |
| `HOST` | Runtime | `127.0.0.1` | Backend server host |
| `DISABLE_WORKTREE_ORPHAN_CLEANUP` | Runtime | Not set | Disable git worktree cleanup (for debugging) |

**Build-time variables** must be set when running `pnpm run build`. **Runtime variables** are read when the application starts.

#### Custom GitHub OAuth App (Optional)

By default, Vibe Kanban uses Bloop AI's GitHub OAuth app for authentication. To use your own GitHub app for self-hosting or custom branding:

1. Create a GitHub OAuth App at [GitHub Developer Settings](https://github.com/settings/developers)
2. Enable "Device Flow" in the app settings
3. Set scopes to include `user:email,repo`
4. Build with your client ID:
   ```bash
   GITHUB_CLIENT_ID=your_client_id_here pnpm run build
   ```
