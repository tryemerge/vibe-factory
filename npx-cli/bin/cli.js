#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Check if system is app-darwin-arm64
const platform = process.platform;
const arch = process.arch;

if (platform !== "darwin" || arch !== "arm64") {
  console.error(
    "❌ This package only supports macOS ARM64 (Apple Silicon) systems."
  );
  console.error(`Current system: ${platform}-${arch}`);
  process.exit(1);
}

function getExtractDir() {
  return path.join(__dirname, "..", "dist", "app-darwin-arm64");
}

function setupBinaries() {
  const extractDir = getExtractDir();
  const zipName = "vibe-kanban.zip";
  const zipPath = path.join(extractDir, zipName);

  // Check if zip file exists
  if (!fs.existsSync(zipPath)) {
    console.error("❌ vibe-kanban.zip not found at:", zipPath);
    process.exit(1);
  }

  // Check if already extracted
  const binaryPath = path.join(extractDir, "vibe-kanban");
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  // Clean out any previous extraction (but keep the zip and mcp-server)
  console.log("🧹 Cleaning up old files…");
  fs.readdirSync(extractDir).forEach((name) => {
    if (name !== zipName && name !== "mcp-server") {
      fs.rmSync(path.join(extractDir, name), { recursive: true, force: true });
    }
  });

  // Unzip the file
  console.log("📦 Extracting vibe-kanban...");
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "inherit" });

  return binaryPath;
}

function main() {
  try {
    const binaryPath = setupBinaries();

    // Execute the binary
    console.log("🚀 Launching vibe-kanban...");
    console.log("💡 After starting, you can use MCP integration with:");
    console.log("   npx vibe-kanban-mcp");
    console.log("");

    execSync(`"${binaryPath}"`, { stdio: "inherit" });
  } catch (error) {
    console.error("❌ Error running vibe-kanban:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getExtractDir, setupBinaries };