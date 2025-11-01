#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const net = require("net");

const PORTS_FILE = path.join(__dirname, "..", ".dev-ports.json");

/**
 * Check if a port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: "localhost" });
    sock.on("connect", () => {
      sock.destroy();
      resolve(false);
    });
    sock.on("error", () => resolve(true));
  });
}

/**
 * Find a free port starting from a given port
 */
async function findFreePort(startPort = 4500) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
    if (port > 65535) {
      throw new Error("No available ports found");
    }
  }
  return port;
}

/**
 * Load existing ports from file
 */
function loadPorts() {
  try {
    if (fs.existsSync(PORTS_FILE)) {
      const data = fs.readFileSync(PORTS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn("Failed to load existing ports:", error.message);
  }
  return null;
}

/**
 * Save ports to file
 */
function savePorts(ports) {
  try {
    fs.writeFileSync(PORTS_FILE, JSON.stringify(ports, null, 2));
  } catch (error) {
    console.error("Failed to save ports:", error.message);
    throw error;
  }
}

/**
 * Verify that saved ports are still available
 */
async function verifyPorts(ports) {
  const frontendAvailable = await isPortAvailable(ports.frontend);
  const backendAvailable = await isPortAvailable(ports.backend);
  return frontendAvailable && backendAvailable;
}

/**
 * Allocate ports for worktree development (4500+ frontend, 4600+ backend)
 */
async function allocatePorts() {
  // Try to load existing ports first
  const existingPorts = loadPorts();

  if (existingPorts) {
    // Verify existing ports are still available
    if (await verifyPorts(existingPorts)) {
      return existingPorts;
    }
  }

  // Find new free ports in worktree ranges
  const frontendPort = await findFreePort(4500);
  const backendPort = await findFreePort(4600);

  const ports = {
    frontend: frontendPort,
    backend: backendPort,
    timestamp: new Date().toISOString(),
  };

  savePorts(ports);

  return ports;
}

/**
 * Get ports
 */
async function getPorts() {
  return await allocatePorts();
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case "frontend":
      getPorts()
        .then((ports) => {
          console.log(ports.frontend);
        })
        .catch(console.error);
      break;

    case "backend":
      getPorts()
        .then((ports) => {
          console.log(ports.backend);
        })
        .catch(console.error);
      break;

    default:
      getPorts()
        .then((ports) => {
          console.log(JSON.stringify(ports, null, 2));
        })
        .catch(console.error);
      break;
  }
}

module.exports = { getPorts, findFreePort };
