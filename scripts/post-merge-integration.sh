#!/bin/bash
# Post-merge integration script
# Run this in the MAIN REPOSITORY after merging a PR to apply migrations and verify system health

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   Post-Merge Integration${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# STEP 0: Safety check - verify we're in main repo
echo -e "${YELLOW}[0/8]${NC} Verifying main repository..."
if [ ! -d .git ]; then
    echo -e "${RED}❌ ERROR: This script must run in the main repository, not a worktree!${NC}"
    exit 1
fi

if [ -f .git ]; then
    echo -e "${RED}❌ ERROR: This is a worktree, not the main repository!${NC}"
    echo -e "${YELLOW}Run this script in: /Users/the_dusky/code/emerge/vibe-factory${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Running in main repository${NC}"
echo ""

# STEP 1: Create pre-merge backup
echo -e "${YELLOW}[1/8]${NC} Creating pre-integration backup..."
./scripts/backup-database.sh
echo -e "${GREEN}✓ Backup created${NC}"
echo ""

# STEP 2: Pull latest changes
echo -e "${YELLOW}[2/8]${NC} Pulling latest changes..."
git pull
echo -e "${GREEN}✓ Code updated${NC}"
echo ""

# STEP 3: Check for new migrations
echo -e "${YELLOW}[3/8]${NC} Checking for new migrations..."
DB_PATH="dev_assets/db.sqlite"

if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}❌ ERROR: Database not found at $DB_PATH${NC}"
    exit 1
fi

# Get list of all migration files
MIGRATION_FILES=$(ls crates/db/migrations/*.sql 2>/dev/null | grep -oE "[0-9]{14}" | sort -n)

# Get list of applied migrations
APPLIED_MIGRATIONS=$(sqlite3 "$DB_PATH" "SELECT version FROM _sqlx_migrations ORDER BY version")

# Find unapplied migrations
UNAPPLIED=""
for MIGRATION in $MIGRATION_FILES; do
    if ! echo "$APPLIED_MIGRATIONS" | grep -q "^$MIGRATION$"; then
        UNAPPLIED="$UNAPPLIED $MIGRATION"
    fi
done

if [ -z "$UNAPPLIED" ]; then
    echo -e "${GREEN}✓ No new migrations to apply${NC}"
    HAS_NEW_MIGRATIONS=false
else
    echo -e "${YELLOW}⚠️  Found unapplied migrations:${NC}"
    for MIG in $UNAPPLIED; do
        FILENAME=$(ls crates/db/migrations/${MIG}_*.sql)
        echo "   - $(basename $FILENAME)"
    done
    HAS_NEW_MIGRATIONS=true
fi
echo ""

# STEP 4: Apply migrations if needed
if [ "$HAS_NEW_MIGRATIONS" = true ]; then
    echo -e "${YELLOW}[4/8]${NC} Applying migrations..."

    # Stop any running dev servers first
    echo -e "${YELLOW}   Stopping dev servers...${NC}"
    pkill -f "concurrently.*backend:dev" 2>/dev/null || true
    pkill -f "cargo-watch" 2>/dev/null || true
    pkill -f "vite.*3401" 2>/dev/null || true
    sleep 2

    # Apply migrations using SQLx
    DATABASE_URL="sqlite://$(pwd)/$DB_PATH" sqlx migrate run

    echo -e "${GREEN}✓ Migrations applied${NC}"
else
    echo -e "${YELLOW}[4/8]${NC} Skipping migration application (no new migrations)"
fi
echo ""

# STEP 5: Regenerate SQLx query cache
if [ "$HAS_NEW_MIGRATIONS" = true ]; then
    echo -e "${YELLOW}[5/8]${NC} Regenerating SQLx query cache..."
    DATABASE_URL="sqlite://$(pwd)/$DB_PATH" cargo sqlx prepare --workspace
    echo -e "${GREEN}✓ SQLx cache regenerated${NC}"
else
    echo -e "${YELLOW}[5/8]${NC} Skipping SQLx cache regeneration (no new migrations)"
fi
echo ""

# STEP 6: Install dependencies
echo -e "${YELLOW}[6/8]${NC} Installing dependencies..."
pnpm install >/dev/null 2>&1
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# STEP 7: Test server startup
echo -e "${YELLOW}[7/8]${NC} Testing server startup..."
BACKEND_PORT=0 timeout 15 cargo run --bin server >/tmp/post-merge-server.log 2>&1 &
SERVER_PID=$!
sleep 8

# Check if server started successfully
if ps -p $SERVER_PID > /dev/null; then
    # Try to hit health endpoint
    if timeout 5 bash -c 'until curl -s http://127.0.0.1:3501/api/health >/dev/null 2>&1; do sleep 0.5; done'; then
        echo -e "${GREEN}✓ Server started successfully${NC}"
        kill $SERVER_PID 2>/dev/null || true
    else
        echo -e "${RED}❌ ERROR: Server started but health check failed${NC}"
        kill $SERVER_PID 2>/dev/null || true
        tail -30 /tmp/post-merge-server.log
        exit 1
    fi
else
    echo -e "${RED}❌ ERROR: Server failed to start!${NC}"
    echo -e "${YELLOW}Server log:${NC}"
    tail -30 /tmp/post-merge-server.log
    echo ""
    echo -e "${RED}Rolling back...${NC}"
    # Don't rollback automatically - let user decide
    exit 1
fi
echo ""

# STEP 8: Create post-integration backup
echo -e "${YELLOW}[8/8]${NC} Creating post-integration backup..."
./scripts/backup-database.sh
echo -e "${GREEN}✓ Backup created${NC}"
echo ""

# SUCCESS
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Integration complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Show current database state
TASK_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tasks" 2>/dev/null || echo "0")
AGENT_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agents" 2>/dev/null || echo "0")
echo -e "${GREEN}Database Status:${NC}"
echo -e "  Tasks: $TASK_COUNT"
echo -e "  Agents: $AGENT_COUNT"
echo ""

echo -e "${YELLOW}To start dev servers:${NC}"
echo -e "  pnpm run dev"
echo ""

exit 0
