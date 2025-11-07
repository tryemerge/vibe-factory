#!/bin/bash
set -e

# ============================================================================
# Railway Database Backup Script
# ============================================================================
#
# Downloads database backup from Railway volume.
#
# Prerequisites:
# - Railway CLI installed
# - Railway project linked
# - Database volume created and mounted
#
# Usage:
#   ./scripts/railway-backup-db.sh
#   ./scripts/railway-backup-db.sh --output custom-backup.sqlite
#
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default backup directory
BACKUP_DIR="railway-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DEFAULT_BACKUP_NAME="railway-backup-${TIMESTAMP}.sqlite"

# Parse arguments
CUSTOM_OUTPUT=""
for arg in "$@"; do
    case $arg in
        --output)
            CUSTOM_OUTPUT="$2"
            shift 2
            ;;
        --help)
            echo "Railway Database Backup Script"
            echo ""
            echo "Usage:"
            echo "  $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --output FILE   Custom output filename"
            echo "  --help          Show this help"
            echo ""
            echo "Examples:"
            echo "  $0                               # Auto-named backup"
            echo "  $0 --output my-backup.sqlite     # Custom name"
            echo ""
            exit 0
            ;;
    esac
done

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Railway Database Backup${NC}"
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
echo ""

# Show current project
echo -e "${BLUE}Current Railway project:${NC}"
railway status | grep -E "Project:|Service:" || railway status | head -3
echo ""

# List volumes
echo -e "${BLUE}Finding database volume...${NC}"
echo ""

# Get volumes list
VOLUMES_OUTPUT=$(railway volume list 2>&1)

if echo "$VOLUMES_OUTPUT" | grep -q "No volumes found"; then
    echo -e "${RED}❌ No volumes found in this project${NC}"
    echo ""
    echo "You need to create a volume first:"
    echo "  1. Go to Railway dashboard"
    echo "  2. Select your service"
    echo "  3. Go to 'Data' or 'Storage' tab"
    echo "  4. Create new volume mounted at /data"
    echo ""
    exit 1
fi

echo "$VOLUMES_OUTPUT"
echo ""

# Ask user to confirm volume (or auto-detect if only one)
VOLUME_COUNT=$(echo "$VOLUMES_OUTPUT" | grep -c "vol_" || echo "0")

if [ "$VOLUME_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ No volumes found${NC}"
    exit 1
elif [ "$VOLUME_COUNT" -eq 1 ]; then
    # Auto-detect volume ID
    VOLUME_ID=$(echo "$VOLUMES_OUTPUT" | grep -o "vol_[a-zA-Z0-9]*" | head -1)
    echo -e "${GREEN}✅ Auto-detected volume: ${VOLUME_ID}${NC}"
else
    echo "Multiple volumes found. Enter volume ID to backup:"
    read -r VOLUME_ID
fi

echo ""

# Determine output path
if [ -n "$CUSTOM_OUTPUT" ]; then
    OUTPUT_PATH="$CUSTOM_OUTPUT"
else
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    OUTPUT_PATH="${BACKUP_DIR}/${DEFAULT_BACKUP_NAME}"
fi

# Download database
echo -e "${BLUE}Downloading database from Railway...${NC}"
echo "  Volume: $VOLUME_ID"
echo "  Remote path: /data/db.sqlite"
echo "  Local path: $OUTPUT_PATH"
echo ""

# Check DATABASE_URL to confirm path
DATABASE_URL=$(railway variables | grep "DATABASE_URL" | awk '{print $2}' || echo "")
if [ -n "$DATABASE_URL" ]; then
    echo -e "${BLUE}DATABASE_URL: ${DATABASE_URL}${NC}"
    echo ""
fi

# Download the database file
if railway volume download "$VOLUME_ID" /data/db.sqlite "$OUTPUT_PATH" 2>&1; then
    echo ""
    echo -e "${GREEN}✅ Backup successful!${NC}"
    echo ""

    # Show file info
    if [ -f "$OUTPUT_PATH" ]; then
        FILE_SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)
        echo "Backup details:"
        echo "  File: $OUTPUT_PATH"
        echo "  Size: $FILE_SIZE"
        echo "  Timestamp: $TIMESTAMP"
        echo ""

        # Verify it's a valid SQLite database
        if command -v sqlite3 &> /dev/null; then
            if sqlite3 "$OUTPUT_PATH" "SELECT 'valid' FROM sqlite_master LIMIT 1;" &> /dev/null; then
                echo -e "${GREEN}✅ Database file is valid${NC}"

                # Show table count
                TABLE_COUNT=$(sqlite3 "$OUTPUT_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "unknown")
                echo "  Tables: $TABLE_COUNT"
            else
                echo -e "${YELLOW}⚠️  Database file may be corrupted${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ Backup file not found after download${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "${RED}❌ Backup failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  - Verify volume ID is correct"
    echo "  - Check that database file exists at /data/db.sqlite"
    echo "  - Ensure you have permissions to access the volume"
    echo ""
    exit 1
fi

echo ""
echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Next Steps${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""

echo "To restore this backup:"
echo "  ${BLUE}./scripts/railway-restore-db.sh ${OUTPUT_PATH}${NC}"
echo ""

echo "To inspect backup locally:"
echo "  ${BLUE}sqlite3 ${OUTPUT_PATH}${NC}"
echo "  ${BLUE}sqlite3 ${OUTPUT_PATH} \"SELECT * FROM tasks LIMIT 10;\"${NC}"
echo ""

echo "To schedule automatic backups:"
echo "  See RAILWAY_DATABASE_GUIDE.md for GitHub Actions setup"
echo ""
