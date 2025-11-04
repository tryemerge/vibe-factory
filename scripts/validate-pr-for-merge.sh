#!/bin/bash
# Pre-merge PR validation script
# Run this in a PR worktree BEFORE merging to catch migration and build issues

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Pre-Merge PR Validation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# STEP 1: Verify we're in a worktree
echo -e "${YELLOW}[1/7]${NC} Checking worktree status..."
if [ -d .git ]; then
    echo -e "${RED}❌ ERROR: This script must run in a worktree, not the main repository!${NC}"
    exit 1
fi

if [ ! -f .git ]; then
    echo -e "${RED}❌ ERROR: Not in a git worktree!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Running in worktree${NC}"
echo ""

# STEP 2: Check for database migrations
echo -e "${YELLOW}[2/7]${NC} Checking for new migrations..."
MIGRATION_FILES=$(git diff --name-only master...HEAD | grep "crates/db/migrations/" || echo "")

if [ -z "$MIGRATION_FILES" ]; then
    echo -e "${GREEN}✓ No migrations in this PR${NC}"
    HAS_MIGRATIONS=false
else
    echo -e "${YELLOW}⚠️  Found migrations:${NC}"
    echo "$MIGRATION_FILES" | while read -r file; do
        echo "   - $file"
    done
    HAS_MIGRATIONS=true
fi
echo ""

# STEP 3: If migrations exist, validate they're applied
if [ "$HAS_MIGRATIONS" = true ]; then
    echo -e "${YELLOW}[3/7]${NC} Validating migrations are applied..."

    WORKTREE_DB="$(pwd)/dev_assets/db.sqlite"
    if [ ! -f "$WORKTREE_DB" ]; then
        echo -e "${RED}❌ ERROR: Worktree database not found at $WORKTREE_DB${NC}"
        exit 1
    fi

    # Extract migration versions from filenames
    MIGRATION_VERSIONS=$(echo "$MIGRATION_FILES" | grep -oE "[0-9]{14}" || echo "")

    ALL_APPLIED=true
    for VERSION in $MIGRATION_VERSIONS; do
        APPLIED=$(sqlite3 "$WORKTREE_DB" "SELECT COUNT(*) FROM _sqlx_migrations WHERE version = $VERSION")
        if [ "$APPLIED" -eq 0 ]; then
            echo -e "${RED}   ❌ Migration $VERSION NOT APPLIED to worktree database${NC}"
            ALL_APPLIED=false
        else
            echo -e "${GREEN}   ✓ Migration $VERSION applied${NC}"
        fi
    done

    if [ "$ALL_APPLIED" = false ]; then
        echo -e "${RED}❌ ERROR: Not all migrations are applied!${NC}"
        echo -e "${YELLOW}Run: DATABASE_URL=\"sqlite://$WORKTREE_DB\" sqlx migrate run${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}[3/7]${NC} Skipping migration validation (no migrations)"
fi
echo ""

# STEP 4: Validate SQLx query cache is updated
if [ "$HAS_MIGRATIONS" = true ]; then
    echo -e "${YELLOW}[4/7]${NC} Checking SQLx query cache..."

    # Check if .sqlx directory has changes
    SQLX_CHANGES=$(git diff --name-only master...HEAD | grep "^\.sqlx/" || echo "")

    if [ -z "$SQLX_CHANGES" ]; then
        echo -e "${RED}❌ ERROR: Migrations present but .sqlx/ cache not updated!${NC}"
        echo -e "${YELLOW}Run: DATABASE_URL=\"sqlite://$WORKTREE_DB\" cargo sqlx prepare --workspace${NC}"
        exit 1
    else
        echo -e "${GREEN}✓ SQLx query cache updated${NC}"
    fi
else
    echo -e "${YELLOW}[4/7]${NC} Skipping SQLx cache check (no migrations)"
fi
echo ""

# STEP 5: Run tests
echo -e "${YELLOW}[5/7]${NC} Running tests..."
if pnpm run check >/dev/null 2>&1; then
    echo -e "${GREEN}✓ All checks passed${NC}"
else
    echo -e "${RED}❌ ERROR: Tests failed!${NC}"
    echo -e "${YELLOW}Run: pnpm run check${NC}"
    exit 1
fi
echo ""

# STEP 6: Test build
echo -e "${YELLOW}[6/7]${NC} Testing build..."
if cargo build --workspace --all-targets >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}❌ ERROR: Build failed!${NC}"
    echo -e "${YELLOW}Run: cargo build --workspace --all-targets${NC}"
    exit 1
fi
echo ""

# STEP 7: Test server startup
echo -e "${YELLOW}[7/7]${NC} Testing server startup..."
BACKEND_PORT=0 timeout 10 cargo run --bin server >/tmp/pr-validation-server.log 2>&1 &
SERVER_PID=$!
sleep 5

# Check if server is still running
if ps -p $SERVER_PID > /dev/null; then
    echo -e "${GREEN}✓ Server started successfully${NC}"
    kill $SERVER_PID 2>/dev/null || true
else
    echo -e "${RED}❌ ERROR: Server failed to start!${NC}"
    echo -e "${YELLOW}Last 20 lines of server log:${NC}"
    tail -20 /tmp/pr-validation-server.log
    exit 1
fi
echo ""

# SUCCESS
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ PR is ready to merge!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$HAS_MIGRATIONS" = true ]; then
    echo -e "${YELLOW}⚠️  IMPORTANT: After merging, run in main repo:${NC}"
    echo -e "${YELLOW}   ./scripts/post-merge-integration.sh${NC}"
    echo ""
fi

exit 0
