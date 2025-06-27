#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
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

const extractDir = path.join(__dirname, "..", "dist", "app-darwin-arm64");

const isMcpMode = process.argv.includes('--mcp');

if (isMcpMode) {
  const mcpServerPath = path.join(extractDir, "mcp-server");

  // Check if MCP server binary exists
  if (!fs.existsSync(mcpServerPath)) {
    console.error("❌ MCP server binary not found at:", mcpServerPath);
    console.error("💡 Make sure to run 'npx vibe-kanban' first to extract binaries");
    process.exit(1);
  }

  // Make sure it's executable
  try {
    fs.chmodSync(mcpServerPath, 0o755);
  } catch (error) {
    console.error("⚠️ Warning: Could not set executable permissions:", error.message);
  }

  // Launch MCP server
  console.error("🚀 Starting Vibe Kanban MCP server...");
  console.error("💡 This server shares the database with the main Vibe Kanban application");
  console.error("");

  const mcpProcess = spawn(mcpServerPath, [], {
    stdio: ['pipe', 'pipe', 'inherit'] // stdin/stdout for MCP, stderr for logs
  });

  // Forward stdin to MCP server
  process.stdin.pipe(mcpProcess.stdin);

  // Forward MCP server stdout to our stdout
  mcpProcess.stdout.pipe(process.stdout);

  // Handle process termination
  mcpProcess.on('exit', (code) => {
    process.exit(code || 0);
  });

  mcpProcess.on('error', (error) => {
    console.error("❌ MCP server error:", error.message);
    process.exit(1);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.error("\n🛑 Shutting down MCP server...");
    mcpProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    mcpProcess.kill('SIGTERM');
  });
} else {
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
      fs.rmSync(path.join(extractDir, name), {recursive: true, force: true});
    }
  });

  // Unzip the file
  console.log("📦 Extracting vibe-kanban...");
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, {stdio: "inherit"});

  try {
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