#!/bin/sh
set -e

# ============================================================================
# Railway Entrypoint Script
# ============================================================================
#
# Handles database initialization and migration before starting the server.
# This script runs on every Railway deployment.
#
# Features:
# - Creates /data directory if missing
# - Initializes database from template on first deploy
# - Automatic migrations are handled by the Rust application
# - Graceful error handling
#
# ============================================================================

echo "🚀 Starting Vibe Kanban Railway deployment..."

# Parse DATABASE_URL to extract database path
DB_PATH="${DATABASE_URL#sqlite://}"

# If DATABASE_URL is not set or doesn't start with sqlite://, warn and exit
if [ -z "$DATABASE_URL" ] || [ "$DB_PATH" = "$DATABASE_URL" ]; then
    echo "⚠️  WARNING: DATABASE_URL is not set or not a SQLite URL"
    echo "Expected format: sqlite:///data/db.sqlite"
    echo "Continuing without database initialization..."
    exec "$@"
    exit $?
fi

echo "📊 Database URL: $DATABASE_URL"
echo "📁 Database path: $DB_PATH"

# Ensure the parent directory exists
DB_DIR=$(dirname "$DB_PATH")
if [ ! -d "$DB_DIR" ]; then
    echo "📂 Creating database directory: $DB_DIR"
    mkdir -p "$DB_DIR"
fi

# Initialize database from template if it doesn't exist
if [ ! -f "$DB_PATH" ]; then
    echo "🆕 Database not found, initializing from template..."

    TEMPLATE_DB="/app/dev_assets_template/db.sqlite"

    if [ -f "$TEMPLATE_DB" ]; then
        echo "📋 Copying template database..."
        cp "$TEMPLATE_DB" "$DB_PATH"
        echo "✅ Database initialized successfully"
    else
        echo "⚠️  Template database not found at: $TEMPLATE_DB"
        echo "The application will create a fresh database and run migrations"
    fi
else
    echo "✅ Database already exists at: $DB_PATH"
    # Check database file size for debugging
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "   Database size: $DB_SIZE"
fi

echo ""
echo "🎯 Database initialization complete!"
echo "🔄 Migrations will be applied automatically by the application"
echo "🚀 Starting server..."
echo ""

# Execute the CMD from Dockerfile (the server binary)
exec "$@"
