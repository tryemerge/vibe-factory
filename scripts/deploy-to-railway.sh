#!/bin/bash
set -e

# ============================================================================
# Railway Deployment Script
# ============================================================================
#
# One-command deployment to Railway with safety checks and verification.
#
# Prerequisites:
# - Railway CLI installed
# - Railway project configured (run railway-setup.sh first)
# - Git repository clean or changes committed
#
# Usage:
#   ./scripts/deploy-to-railway.sh
#
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Deploy to Railway${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found${NC}"
    echo ""
    echo "Install with:"
    echo "  npm install -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Railway${NC}"
    echo ""
    echo "Please log in:"
    echo "  railway login"
    exit 1
fi

echo -e "${GREEN}✅ Railway CLI ready${NC}"

# Check if project is linked
if ! railway status &> /dev/null; then
    echo -e "${RED}❌ Not linked to a Railway project${NC}"
    echo ""
    echo "Please link to a project or run setup:"
    echo "  ./scripts/railway-setup.sh"
    echo ""
    echo "Or link manually:"
    echo "  railway link"
    exit 1
fi

echo -e "${GREEN}✅ Railway project linked${NC}"
echo ""

# Show current project info
echo -e "${BLUE}Current Railway project:${NC}"
railway status
echo ""

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  Uncommitted changes detected${NC}"
    echo ""
    git status --short
    echo ""
    echo "Railway deploys from git. You should commit changes first."
    echo ""
    echo -n "Continue anyway? (y/n): "
    read -r CONTINUE

    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
fi

# Pre-deployment checks
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Pre-Deployment Checks${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Check if types are up to date
echo -e "${BLUE}Checking TypeScript types...${NC}"
if ! pnpm run generate-types:check &> /dev/null; then
    echo -e "${YELLOW}⚠️  TypeScript types may be out of sync${NC}"
    echo ""
    echo "Run to fix:"
    echo "  pnpm run generate-types"
    echo ""
    echo -n "Continue anyway? (y/n): "
    read -r CONTINUE

    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
else
    echo -e "${GREEN}✅ TypeScript types up to date${NC}"
fi

# Check SQLx migrations
echo ""
echo -e "${BLUE}Checking SQLx migrations...${NC}"
if [ -d "crates/db/migrations" ]; then
    MIGRATION_COUNT=$(ls -1 crates/db/migrations/*.sql 2>/dev/null | wc -l)
    echo -e "${GREEN}✅ Found $MIGRATION_COUNT migrations${NC}"

    if [ -d ".sqlx" ]; then
        echo -e "${GREEN}✅ SQLx query cache exists${NC}"
    else
        echo -e "${YELLOW}⚠️  SQLx query cache not found${NC}"
        echo "   This may cause build issues"
    fi
else
    echo -e "${YELLOW}⚠️  No migrations directory found${NC}"
fi

# Show current environment variables
echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Current Environment Variables${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""
railway variables

# Confirm deployment
echo ""
echo -e "${YELLOW}Ready to deploy to Railway${NC}"
echo ""
echo -n "Proceed with deployment? (y/n): "
read -r DEPLOY_CONFIRM

if [[ ! "$DEPLOY_CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Deploy
echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Deploying to Railway...${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Run Railway up
railway up

# Check deployment status
echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Deployment Status${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Get deployment URL
echo -e "${BLUE}Getting deployment URL...${NC}"
DEPLOY_URL=$(railway domain 2>/dev/null || echo "URL not available yet")

if [ "$DEPLOY_URL" != "URL not available yet" ]; then
    echo -e "${GREEN}✅ Deployment URL: ${DEPLOY_URL}${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  Deployment URL not available yet${NC}"
    echo "   Check Railway dashboard or run: railway domain"
    echo ""
fi

# Show status
railway status

echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Post-Deployment${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

echo "Next steps:"
echo ""
echo "  1. Monitor logs:"
echo "     ${BLUE}railway logs --tail${NC}"
echo "     ${BLUE}# Or use: ./scripts/railway-logs.sh${NC}"
echo ""
echo "  2. Check health:"
echo "     ${BLUE}curl ${DEPLOY_URL}${NC}"
echo ""
echo "  3. View dashboard:"
echo "     ${BLUE}railway open${NC}"
echo ""
echo "  4. Create backup:"
echo "     ${BLUE}./scripts/railway-backup-db.sh${NC}"
echo ""

echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}✅ Deployment initiated!${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""

echo "Monitor the deployment in your browser:"
railway open
