#!/bin/bash
set -e

# ============================================================================
# Railway Initial Setup Script
# ============================================================================
#
# Sets up a new Railway project from scratch with proper configuration.
# Run this once when deploying to Railway for the first time.
#
# Prerequisites:
# - Railway CLI installed: npm install -g @railway/cli
# - Railway account created: https://railway.app
# - GitHub repository connected
#
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Railway Project Setup for Vibe Kanban${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found${NC}"
    echo ""
    echo "Install with:"
    echo "  npm install -g @railway/cli"
    echo ""
    echo "Or via Homebrew:"
    echo "  brew install railway"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Railway CLI found${NC}"

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Railway${NC}"
    echo ""
    echo "Please log in to Railway:"
    railway login
    echo ""
fi

echo -e "${GREEN}✅ Logged in to Railway${NC}"
echo ""

# Ask if this is a new project or existing
echo -e "${BLUE}Is this a new Railway project? (y/n)${NC}"
read -r NEW_PROJECT

if [[ "$NEW_PROJECT" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BLUE}Creating new Railway project...${NC}"

    # Initialize project
    railway init

    echo -e "${GREEN}✅ Railway project created${NC}"
else
    echo ""
    echo -e "${BLUE}Linking to existing Railway project...${NC}"

    # Link to existing project
    railway link

    echo -e "${GREEN}✅ Linked to Railway project${NC}"
fi

echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Database Configuration${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Ask which database strategy to use
echo "Choose database strategy:"
echo "  1) SQLite with Railway Volume (Recommended)"
echo "  2) PostgreSQL with Railway Plugin"
echo ""
echo -n "Enter choice (1 or 2): "
read -r DB_CHOICE

if [ "$DB_CHOICE" = "1" ]; then
    echo ""
    echo -e "${BLUE}Setting up SQLite with Railway Volume...${NC}"
    echo ""

    # Instructions for volume creation
    echo -e "${YELLOW}⚠️  Volume creation requires Railway dashboard:${NC}"
    echo ""
    echo "  1. Go to your Railway project dashboard"
    echo "  2. Click on your service"
    echo "  3. Go to 'Data' or 'Storage' tab"
    echo "  4. Click 'New Volume'"
    echo "  5. Set mount path: /data"
    echo "  6. Set size: 1GB (adjust as needed)"
    echo "  7. Click 'Create'"
    echo ""
    echo -n "Press Enter when volume is created..."
    read -r

    # Set DATABASE_URL
    echo ""
    echo -e "${BLUE}Setting DATABASE_URL environment variable...${NC}"
    railway variables set DATABASE_URL="sqlite:///data/db.sqlite"

    echo -e "${GREEN}✅ Database URL configured${NC}"

elif [ "$DB_CHOICE" = "2" ]; then
    echo ""
    echo -e "${BLUE}Setting up PostgreSQL...${NC}"
    echo ""

    echo -e "${YELLOW}Adding PostgreSQL plugin...${NC}"
    railway add postgresql

    echo -e "${GREEN}✅ PostgreSQL added (DATABASE_URL auto-set)${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Note: You may need to update SQLx migrations for PostgreSQL${NC}"
    echo "See RAILWAY_DATABASE_GUIDE.md for migration instructions"
else
    echo -e "${RED}Invalid choice. Please run the script again.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Environment Variables Configuration${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Ask about GitHub OAuth configuration
echo "Do you want to use a custom GitHub OAuth app? (y/n)"
echo "(If no, will use default Bloop AI OAuth app)"
read -r CUSTOM_OAUTH

if [[ "$CUSTOM_OAUTH" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Enter your GitHub OAuth Client ID:"
    read -r GITHUB_CLIENT_ID

    if [ -n "$GITHUB_CLIENT_ID" ]; then
        railway variables set GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID"
        echo -e "${GREEN}✅ GitHub Client ID configured${NC}"
    fi
else
    echo -e "${BLUE}Using default Bloop AI OAuth app${NC}"
fi

echo ""

# Set recommended environment variables
echo -e "${BLUE}Setting recommended environment variables...${NC}"

railway variables set RUST_LOG="info"
railway variables set GIT_SCAN_TIMEOUT_MS="10000"
railway variables set GIT_SCAN_HARD_TIMEOUT_MS="20000"
railway variables set GIT_SCAN_MAX_DEPTH="3"
railway variables set VIBE_WORKTREE_DIR="/repos/worktrees"

echo -e "${GREEN}✅ Environment variables configured${NC}"

echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Optional: Analytics Configuration${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

echo "Do you want to configure PostHog analytics? (y/n)"
read -r CONFIGURE_POSTHOG

if [[ "$CONFIGURE_POSTHOG" =~ ^[Yy]$ ]]; then
    echo ""
    echo "Enter PostHog API Key:"
    read -r POSTHOG_API_KEY

    if [ -n "$POSTHOG_API_KEY" ]; then
        railway variables set POSTHOG_API_KEY="$POSTHOG_API_KEY"
        railway variables set POSTHOG_API_ENDPOINT="https://us.i.posthog.com"
        echo -e "${GREEN}✅ PostHog configured${NC}"
    fi
else
    echo -e "${BLUE}Skipping PostHog configuration${NC}"
fi

echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Show all configured variables
echo "Configured environment variables:"
railway variables

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}✅ Railway setup complete!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""

echo "Next steps:"
echo ""
echo "  1. Deploy to Railway:"
echo "     ${BLUE}./scripts/deploy-to-railway.sh${NC}"
echo ""
echo "  2. Monitor deployment:"
echo "     ${BLUE}railway logs --tail${NC}"
echo ""
echo "  3. Get deployment URL:"
echo "     ${BLUE}railway domain${NC}"
echo ""
echo "  4. Create first backup:"
echo "     ${BLUE}./scripts/railway-backup-db.sh${NC}"
echo ""

echo "For more information, see:"
echo "  - RAILWAY_DEPLOYMENT.md"
echo "  - RAILWAY_ENVIRONMENT.md"
echo "  - RAILWAY_DATABASE_GUIDE.md"
echo ""
