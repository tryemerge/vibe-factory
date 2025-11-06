#!/bin/bash
# Automated database backup script for vibe-factory
# Keeps last 10 backups with timestamps

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
DB_PATH="dev_assets/db.sqlite"
BACKUP_DIR="dev_assets/backups"
MAX_BACKUPS=10

# Get script directory and navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

# Check if this is main repo (has .git directory)
if [ ! -d .git ]; then
    echo "ERROR: This script should only run in the main repository"
    exit 1
fi

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Database not found at $DB_PATH"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate backup filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/db_backup_$TIMESTAMP.sqlite"

# Create backup
echo -e "${GREEN}📦 Creating database backup...${NC}"
cp "$DB_PATH" "$BACKUP_FILE"
DB_SIZE=$(wc -c < "$DB_PATH" | awk '{print $1}')
echo -e "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"
echo -e "${GREEN}  Size: $(numfmt --to=iec $DB_SIZE)${NC}"

# Count tasks in backup
TASK_COUNT=$(sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM tasks" 2>/dev/null || echo "0")
echo -e "${GREEN}  Tasks: $TASK_COUNT${NC}"

# Cleanup old backups (keep last MAX_BACKUPS)
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/db_backup_*.sqlite 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    echo -e "${YELLOW}🗑️  Removing $REMOVE_COUNT old backup(s)...${NC}"
    ls -1t "$BACKUP_DIR"/db_backup_*.sqlite | tail -n "$REMOVE_COUNT" | xargs rm -f
fi

echo -e "${GREEN}✓ Backup complete!${NC}"
echo ""
echo "Recent backups:"
ls -lht "$BACKUP_DIR"/db_backup_*.sqlite | head -5
