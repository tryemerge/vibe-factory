#!/bin/bash
set -e

# ============================================================================
# Railway Database Restore Script
# ============================================================================
#
# Uploads a database backup to Railway volume.
#
# ⚠️  WARNING: This will overwrite the existing database!
# ⚠️  Make sure to backup the current database first.
#
# Prerequisites:
# - Railway CLI installed
# - Railway project linked
# - Database volume created and mounted
# - Backup file available
#
# Usage:
#   ./scripts/railway-restore-db.sh backup.sqlite
#
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}❌ Error: Backup file required${NC}"
    echo ""
    echo "Usage:"
    echo "  $0 <backup-file.sqlite>"
    echo ""
    echo "Example:"
    echo "  $0 railway-backups/railway-backup-20251106-123456.sqlite"
    echo ""
    exit 1
fi

BACKUP_FILE="$1"

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Railway Database Restore${NC}"
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
    echo "Run: railway login"
    exit 1
fi

# Check if project is linked
if ! railway status &> /dev/null; then
    echo -e "${RED}❌ Not linked to a Railway project${NC}"
    echo "Run: railway link"
    exit 1
fi

echo -e "${GREEN}✅ Railway CLI ready${NC}"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Backup file not found: ${BACKUP_FILE}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Backup file found${NC}"
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "   File: $BACKUP_FILE"
echo "   Size: $FILE_SIZE"
echo ""

# Verify it's a valid SQLite database
if command -v sqlite3 &> /dev/null; then
    if sqlite3 "$BACKUP_FILE" "SELECT 'valid' FROM sqlite_master LIMIT 1;" &> /dev/null; then
        echo -e "${GREEN}✅ Database file is valid${NC}"
        TABLE_COUNT=$(sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "unknown")
        echo "   Tables: $TABLE_COUNT"
    else
        echo -e "${RED}❌ Invalid SQLite database file${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  sqlite3 not found, skipping validation${NC}"
fi

echo ""

# Show current project
echo -e "${BLUE}Current Railway project:${NC}"
railway status | grep -E "Project:|Service:" || railway status | head -3
echo ""

# List volumes
echo -e "${BLUE}Finding database volume...${NC}"
echo ""

VOLUMES_OUTPUT=$(railway volume list 2>&1)

if echo "$VOLUMES_OUTPUT" | grep -q "No volumes found"; then
    echo -e "${RED}❌ No volumes found in this project${NC}"
    exit 1
fi

echo "$VOLUMES_OUTPUT"
echo ""

# Ask user to confirm volume
VOLUME_COUNT=$(echo "$VOLUMES_OUTPUT" | grep -c "vol_" || echo "0")

if [ "$VOLUME_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ No volumes found${NC}"
    exit 1
elif [ "$VOLUME_COUNT" -eq 1 ]; then
    VOLUME_ID=$(echo "$VOLUMES_OUTPUT" | grep -o "vol_[a-zA-Z0-9]*" | head -1)
    echo -e "${GREEN}✅ Auto-detected volume: ${VOLUME_ID}${NC}"
else
    echo "Multiple volumes found. Enter volume ID to restore to:"
    read -r VOLUME_ID
fi

echo ""

# ⚠️  WARNING
echo -e "${RED}=============================================${NC}"
echo -e "${RED}⚠️  WARNING: DESTRUCTIVE OPERATION${NC}"
echo -e "${RED}=============================================${NC}"
echo ""
echo "This will:"
echo "  1. Stop your Railway service"
echo "  2. OVERWRITE the existing database at /data/db.sqlite"
echo "  3. Upload the backup file"
echo "  4. Restart the service"
echo ""
echo -e "${YELLOW}Current database will be PERMANENTLY REPLACED!${NC}"
echo ""
echo "Backup file:"
echo "  Local: $BACKUP_FILE"
echo "  Size: $FILE_SIZE"
echo ""
echo "Target:"
echo "  Volume: $VOLUME_ID"
echo "  Path: /data/db.sqlite"
echo ""

# Final confirmation
echo -n "Type 'RESTORE' to confirm (case-sensitive): "
read -r CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
    echo ""
    echo "Restore cancelled."
    exit 0
fi

echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Starting Restore Process${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

# Step 1: Stop service
echo -e "${BLUE}Step 1: Stopping Railway service...${NC}"
if railway service stop 2>&1; then
    echo -e "${GREEN}✅ Service stopped${NC}"
else
    echo -e "${YELLOW}⚠️  Could not stop service (may not support this command)${NC}"
    echo "   Continuing anyway..."
fi
echo ""

# Step 2: Upload backup
echo -e "${BLUE}Step 2: Uploading backup to Railway volume...${NC}"
echo "  Source: $BACKUP_FILE"
echo "  Target: $VOLUME_ID:/data/db.sqlite"
echo ""

if railway volume upload "$VOLUME_ID" "$BACKUP_FILE" /data/db.sqlite 2>&1; then
    echo ""
    echo -e "${GREEN}✅ Backup uploaded successfully${NC}"
else
    echo ""
    echo -e "${RED}❌ Upload failed${NC}"
    echo ""
    echo "Attempting to restart service..."
    railway service start 2>&1 || true
    exit 1
fi

echo ""

# Step 3: Restart service
echo -e "${BLUE}Step 3: Restarting Railway service...${NC}"
if railway service start 2>&1; then
    echo -e "${GREEN}✅ Service restarted${NC}"
else
    echo -e "${YELLOW}⚠️  Could not restart service (may not support this command)${NC}"
    echo "   You may need to restart manually via Railway dashboard"
fi

echo ""

# Step 4: Monitor startup
echo -e "${BLUE}Step 4: Monitoring service startup...${NC}"
echo ""
echo "Waiting for service to start (10 seconds)..."
sleep 10

echo ""
echo "Recent logs:"
railway logs | tail -20 || echo "Could not fetch logs"

echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN}✅ Restore Complete${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""

echo "Next steps:"
echo ""
echo "  1. Verify logs:"
echo "     ${BLUE}railway logs --tail${NC}"
echo "     ${BLUE}# Or: ./scripts/railway-logs.sh${NC}"
echo ""
echo "  2. Check health:"
echo "     ${BLUE}railway status${NC}"
echo ""
echo "  3. Test application:"
echo "     ${BLUE}curl \$(railway domain)${NC}"
echo ""
echo "  4. Verify data:"
echo "     ${BLUE}# Create backup to verify: ./scripts/railway-backup-db.sh${NC}"
echo ""

echo -e "${YELLOW}If anything went wrong:${NC}"
echo "  - Check Railway dashboard for errors"
echo "  - Review logs: railway logs --tail"
echo "  - You may need to restore from another backup"
echo ""
