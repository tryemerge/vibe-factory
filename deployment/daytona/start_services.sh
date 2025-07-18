#!/bin/bash

# Kill ALL existing sessions with these names
pkill -f "SCREEN.*code-server" || true
pkill -f "SCREEN.*vibe-kanban" || true

# Wait a moment
sleep 1

# Start code-server in screen session
screen -S code-server -d -m code-server --bind-addr 0.0.0.0:3022

# Start vibe-kanban in screen session
screen -S vibe-kanban -d -m npx ./vibe-kanban.tgz -y

echo "Setup complete!"
echo "Use 'screen -r code-server' to attach to code-server session"
echo "Use 'screen -r vibe-kanban' to attach to vibe-kanban session"
echo "code-server accessible at: http://localhost:3022"