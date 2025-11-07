#!/bin/bash

# Test script to simulate Railway database initialization

set -e

echo "🧪 Testing Railway Database Setup"
echo "=================================="

# Create test directories
TEST_DIR=$(mktemp -d)
echo "📁 Test directory: $TEST_DIR"

# Simulate Railway environment
mkdir -p "$TEST_DIR/data"
mkdir -p "$TEST_DIR/app/dev_assets_template"

# Copy template database
echo "📋 Copying template database..."
cp dev_assets_template/db.sqlite "$TEST_DIR/app/dev_assets_template/"

# Export DATABASE_URL
export DATABASE_URL="sqlite://$TEST_DIR/data/db.sqlite"

echo ""
echo "📊 Testing first run (database initialization)..."
echo "---------------------------------------------------"

# Create a modified entrypoint script that works with our test paths
cat > "$TEST_DIR/test-entrypoint.sh" << 'EOF'
#!/bin/bash
set -e

echo "🚀 Starting Vibe Kanban Railway deployment..."

# Parse DATABASE_URL to extract database path
DB_PATH="${DATABASE_URL#sqlite://}"

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

    TEMPLATE_DB="$TEST_TEMPLATE_PATH"

    if [ -f "$TEMPLATE_DB" ]; then
        echo "📋 Copying template database..."
        cp "$TEMPLATE_DB" "$DB_PATH"
        echo "✅ Database initialized successfully"
    else
        echo "⚠️  Template database not found at: $TEMPLATE_DB"
    fi
else
    echo "✅ Database already exists at: $DB_PATH"
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "   Database size: $DB_SIZE"
fi

echo ""
echo "🎯 Database initialization complete!"
EOF

chmod +x "$TEST_DIR/test-entrypoint.sh"

# Run test with template path
export TEST_TEMPLATE_PATH="$TEST_DIR/app/dev_assets_template/db.sqlite"
bash "$TEST_DIR/test-entrypoint.sh"

# Verify database was created
if [ -f "$TEST_DIR/data/db.sqlite" ]; then
    echo ""
    echo "✅ SUCCESS: Database initialized"
    ls -lh "$TEST_DIR/data/db.sqlite"
else
    echo ""
    echo "❌ FAILURE: Database not created"
    exit 1
fi

echo ""
echo "📊 Testing second run (database already exists)..."
echo "----------------------------------------------------"

# Run again to test existing database detection
bash "$TEST_DIR/test-entrypoint.sh"

# Cleanup
echo ""
echo "🧹 Cleaning up test directory..."
rm -rf "$TEST_DIR"

echo ""
echo "✅ All tests passed!"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Commit changes: git add -A && git commit -m 'Add Railway database persistence'"
echo "2. Push to Railway: git push origin master"
echo "3. Create Railway volume: /data"
echo "4. Set DATABASE_URL: sqlite:///data/db.sqlite"
echo "5. Monitor logs: railway logs --tail"
