from dotenv import load_dotenv
from daytona import Daytona, DaytonaConfig, CreateSandboxFromSnapshotParams
import os
  
load_dotenv()
# Define the configuration
config = DaytonaConfig(api_key=os.getenv("DAYTONA_API_KEY"))

# Initialize the Daytona client
daytona = Daytona(config)

# Create the Sandbox instance
params = CreateSandboxFromSnapshotParams(
    language="python",
    auto_stop_interval=0,  # Disables the auto-stop feature - default is 15 minutes
    labels={"vk-id": "vk-1"},
    snapshot="daytona-4vcpu-8ram-10gb",
    env_vars={"ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
              "HOST": "0.0.0.0", "BACKEND_PORT": "3001"
              },
)
try:
    sandbox = daytona.find_one(labels={"vk-id": "vk-1"})
except:
    sandbox = daytona.create(params, timeout=40)

# Upload the scripts
sandbox.fs.upload_file("install_deps.sh", "/home/daytona/install_deps.sh")
sandbox.fs.upload_file("start_services.sh", "/home/daytona/start_services.sh")
sandbox.fs.upload_file("/Users/alexnetsch/bloop/vibe-kanban/npx-cli/vibe-kanban-0.0.52.tgz", "/home/daytona/vibe-kanban.tgz")

# Make scripts executable
sandbox.process.exec("chmod +x /home/daytona/install_deps.sh", timeout=0)
sandbox.process.exec("chmod +x /home/daytona/start_services.sh", timeout=0)

# Run installation script
print("Running installation script...")
install_response = sandbox.process.exec("bash /home/daytona/install_deps.sh", timeout=0)
if install_response.exit_code != 0:
    print(f"Installation failed: {install_response.exit_code} {install_response.result}")
else:
    print(install_response.result)

preview_info = sandbox.get_preview_link(3001)
print(f"Preview link url: {preview_info.url}")
print(f"Preview link token: {preview_info.token}")
preview_info_2 = sandbox.get_preview_link(3022)
print(f"Preview link url: {preview_info_2.url}")
print(f"Preview link token: {preview_info_2.token}")

# Run services startup script
print("\nStarting services...")
response = sandbox.process.exec("bash /home/daytona/start_services.sh", timeout=0, env={"CLOUD_RUNNER": "true"})
if response.exit_code != 0:
    print(f"Error: {response.exit_code} {response.result}")
else:
    print(response.result)
  
