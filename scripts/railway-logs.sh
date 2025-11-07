#!/bin/bash

# ============================================================================
# Railway Logs Viewer Script
# ============================================================================
#
# Stream and filter Railway deployment logs with helpful shortcuts.
#
# Prerequisites:
# - Railway CLI installed
# - Railway project linked
#
# Usage:
#   ./scripts/railway-logs.sh              # Stream all logs
#   ./scripts/railway-logs.sh --tail 100   # Last 100 lines
#   ./scripts/railway-logs.sh --errors     # Only errors
#   ./scripts/railway-logs.sh --database   # Database-related logs
#   ./scripts/railway-logs.sh --help       # Show help
#
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Show help
show_help() {
    echo "Railway Logs Viewer"
    echo ""
    echo "Usage:"
    echo "  $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --tail N        Show last N lines then follow"
    echo "  --errors        Filter for errors only"
    echo "  --database      Filter for database-related logs"
    echo "  --migrations    Filter for migration logs"
    echo "  --git           Filter for git-related logs"
    echo "  --build         Show build logs"
    echo "  --deploy        Show deployment logs"
    echo "  --help          Show this help"
    echo ""
    echo "Examples:"
    echo "  $0                      # Stream all logs"
    echo "  $0 --tail 100           # Last 100 lines"
    echo "  $0 --errors             # Only errors"
    echo "  $0 --database           # Database logs"
    echo ""
}

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
    echo "Run: railway login"
    exit 1
fi

# Check if project is linked
if ! railway status &> /dev/null; then
    echo -e "${RED}❌ Not linked to a Railway project${NC}"
    echo "Run: railway link"
    exit 1
fi

# Parse arguments
MODE="stream"
FILTER=""
TAIL_LINES=""

for arg in "$@"; do
    case $arg in
        --help)
            show_help
            exit 0
            ;;
        --tail)
            TAIL_LINES="$2"
            shift 2
            ;;
        --errors)
            FILTER="error"
            ;;
        --database)
            FILTER="database|migration|sqlx"
            ;;
        --migrations)
            FILTER="migration|sqlx::migrate"
            ;;
        --git)
            FILTER="git|worktree|repository"
            ;;
        --build)
            MODE="build"
            ;;
        --deploy)
            MODE="deploy"
            ;;
    esac
done

# Show current project
echo -e "${BLUE}Railway Project:${NC}"
railway status | grep -E "Project:|Service:" || railway status | head -3
echo ""

# Execute based on mode
case $MODE in
    build)
        echo -e "${BLUE}Showing build logs...${NC}"
        echo ""
        railway logs --type build
        ;;
    deploy)
        echo -e "${BLUE}Showing deployment logs...${NC}"
        echo ""
        railway logs --type deploy
        ;;
    stream)
        if [ -n "$TAIL_LINES" ]; then
            echo -e "${BLUE}Showing last ${TAIL_LINES} lines and streaming...${NC}"
            echo ""
            if [ -n "$FILTER" ]; then
                railway logs | tail -n "$TAIL_LINES" | grep -iE "$FILTER" --color=always
                railway logs --tail | grep -iE "$FILTER" --color=always
            else
                railway logs | tail -n "$TAIL_LINES"
                railway logs --tail
            fi
        elif [ -n "$FILTER" ]; then
            echo -e "${BLUE}Streaming logs (filtered: ${FILTER})...${NC}"
            echo ""
            railway logs --tail | grep -iE "$FILTER" --color=always
        else
            echo -e "${BLUE}Streaming all logs...${NC}"
            echo ""
            echo -e "${YELLOW}Tip: Use --errors, --database, --migrations, or --git to filter${NC}"
            echo ""
            railway logs --tail
        fi
        ;;
esac
