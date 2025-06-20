#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if system is app-darwin-arm64
const platform = process.platform;
const arch = process.arch;

if (platform !== 'darwin' || arch !== 'arm64') {
  console.error('❌ This package only supports macOS ARM64 (Apple Silicon) systems.');
  console.error(`Current system: ${platform}-${arch}`);
  process.exit(1);
}

try {
  const zipPath = path.join(__dirname, '..', 'dist', 'app-darwin-arm64', 'vibe-kanban.zip');
  const extractDir = path.join(__dirname, '..', 'dist', 'app-darwin-arm64');
  
  // Check if zip file exists
  if (!fs.existsSync(zipPath)) {
    console.error('❌ vibe-kanban.zip not found at:', zipPath);
    process.exit(1);
  }

  // Unzip the file
  console.log('📦 Extracting vibe-kanban...');
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' });
  
  // Execute the binary
  const binaryPath = path.join(extractDir, 'vibe-kanban');
  console.log('🚀 Launching vibe-kanban...');
  execSync(`"${binaryPath}"`, { stdio: 'inherit' });
  
} catch (error) {
  console.error('❌ Error running vibe-kanban:', error.message);
  process.exit(1);
}
