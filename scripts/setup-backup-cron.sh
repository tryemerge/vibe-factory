#!/bin/bash
# Helper script to set up automated database backups via cron
# Runs backup every hour

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get absolute path to project
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_SCRIPT="$PROJECT_DIR/scripts/backup-database.sh"

echo -e "${GREEN}🔧 Setting up automated database backups...${NC}"
echo ""
echo "Project directory: $PROJECT_DIR"
echo "Backup script: $BACKUP_SCRIPT"
echo ""

# Check if backup script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo -e "${RED}ERROR: Backup script not found!${NC}"
    exit 1
fi

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"

# Generate cron entry (runs every hour)
CRON_ENTRY="0 * * * * cd $PROJECT_DIR && $BACKUP_SCRIPT >> $PROJECT_DIR/dev_assets/backups/backup.log 2>&1"

echo -e "${YELLOW}Recommended cron entry (hourly backups):${NC}"
echo ""
echo "$CRON_ENTRY"
echo ""

echo -e "${YELLOW}To install:${NC}"
echo "  1. Run: crontab -e"
echo "  2. Add the line above"
echo "  3. Save and exit"
echo ""

echo -e "${GREEN}Or run this one-liner to install automatically:${NC}"
echo "(crontab -l 2>/dev/null; echo \"$CRON_ENTRY\") | crontab -"
echo ""

echo -e "${YELLOW}To test the backup manually:${NC}"
echo "  $BACKUP_SCRIPT"
echo ""
