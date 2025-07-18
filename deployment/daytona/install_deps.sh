#!/bin/bash

# Update package lists
apt update

# Install screen and other dependencies
apt install -y screen wget curl

# Check if code-server is installed, if not install it
if ! command -v code-server &> /dev/null; then
    echo "code-server not found, installing..."
    curl -fsSL https://code-server.dev/install.sh | sh
else
    echo "code-server already installed"
fi

echo "Installation complete!"
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "npx version: $(npx --version)"
echo "code-server version: $(code-server --version | head -1)"