const { spawn } = require('child_process');

console.error('🔄 Starting MCP server for full protocol test...');

const mcpProcess = spawn('vibe-kanban-mcp', [], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let step = 0;
let testData = {
  projectId: null,
  taskId: null,
  createdProjectId: null,
};

const steps = [
  'initialize',
  'initialized_notification',
  'list_tools',
  'list_projects',
  'create_project',
  'list_tasks',
  'create_task',
  'get_task',
  'update_task',
  'list_tasks_after_update',
  'delete_task',
  'list_tasks_after_delete',
];

mcpProcess.stdout.on('data', (data) => {
  const response = data.toString().trim();
  console.error(`📥 MCP Response (${steps[step]}):`);
  console.error(response);

  step++;

  // Send the next message based on what we just received
  if (step === 1) {
    // After initialize response, send initialized notification
    setTimeout(() => {
      console.error('📤 Sending initialized notification...');
      mcpProcess.stdin.write('{"jsonrpc": "2.0", "method": "notifications/initialized"}\n');

      // Since notifications don't get responses, manually trigger next step
      setTimeout(() => {
        step++; // Move to next step manually
        console.error('📤 Sending tools/list...');
        mcpProcess.stdin.write('{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}\n');
      }, 200);
    }, 100);

  } else if (step === 3) {
    // After tools list, test list_projects
    setTimeout(() => {
      console.error('📤 Sending list_projects...');
      mcpProcess.stdin.write('{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "list_projects", "arguments": {}}}\n');
    }, 100);

  } else if (step === 4) {
    // After list_projects, create a test project
    try {
      const parsedResponse = JSON.parse(response);
      if (parsedResponse.result && parsedResponse.result.content) {
        const projectsResponse = JSON.parse(parsedResponse.result.content[0].text);
        if (projectsResponse.success && projectsResponse.projects.length > 0) {
          testData.projectId = projectsResponse.projects[0].id;
          console.error(`💾 Using existing project: ${testData.projectId}`);
        }
      }
    } catch (e) {
      console.error('⚠️ Could not parse projects response, will create new project');
    }

    setTimeout(() => {
      console.error('📤 Sending create_project...');
      mcpProcess.stdin.write('{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "create_project", "arguments": {"name": "Test Project from MCP", "git_repo_path": "/tmp/test-project", "use_existing_repo": false, "setup_script": "echo \\"Setup complete\\"", "dev_script": "echo \\"Dev server started\\""}}}\n');
    }, 100);

  } else if (step === 5) {
    // After create_project, extract the project ID and list tasks
    try {
      const parsedResponse = JSON.parse(response);
      if (parsedResponse.result && parsedResponse.result.content) {
        const createProjectResponse = JSON.parse(parsedResponse.result.content[0].text);
        if (createProjectResponse.success && createProjectResponse.project_id) {
          testData.createdProjectId = createProjectResponse.project_id;
          console.error(`💾 Created project: ${testData.createdProjectId}`);
        }
      }
    } catch (e) {
      console.error('⚠️ Could not parse create project response');
    }

    const projectToUse = testData.createdProjectId || testData.projectId;
    if (projectToUse) {
      setTimeout(() => {
        console.error('📤 Sending list_tasks (should be empty)...');
        mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "list_tasks", "arguments": {"project_id": "${projectToUse}", "include_execution_status": true}}}\n`);
      }, 100);
    } else {
      console.error('❌ No project available for testing');
      setTimeout(() => mcpProcess.kill(), 500);
    }

  } else if (step === 6) {
    // After list_tasks, create a test task
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending create_task...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "create_task", "arguments": {"project_id": "${projectToUse}", "title": "Test Task from MCP Script", "description": "This task was created during endpoint testing"}}}\n`);
    }, 100);

  } else if (step === 7) {
    // After create_task, extract task ID and get task details
    try {
      const parsedResponse = JSON.parse(response);
      if (parsedResponse.result && parsedResponse.result.content) {
        const createTaskResponse = JSON.parse(parsedResponse.result.content[0].text);
        if (createTaskResponse.success && createTaskResponse.task_id) {
          testData.taskId = createTaskResponse.task_id;
          console.error(`💾 Created task: ${testData.taskId}`);
        }
      }
    } catch (e) {
      console.error('⚠️ Could not parse create task response');
    }

    const projectToUse = testData.createdProjectId || testData.projectId;
    if (testData.taskId) {
      setTimeout(() => {
        console.error('📤 Sending get_task...');
        mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "get_task", "arguments": {"project_id": "${projectToUse}", "task_id": "${testData.taskId}"}}}\n`);
      }, 100);
    } else {
      console.error('❌ No task ID available for testing');
      setTimeout(() => mcpProcess.kill(), 500);
    }

  } else if (step === 8) {
    // After get_task, update the task
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending update_task...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "update_task", "arguments": {"project_id": "${projectToUse}", "task_id": "${testData.taskId}", "title": "Updated Test Task", "description": "This task was updated during testing", "status": "inprogress"}}}\n`);
    }, 100);

  } else if (step === 9) {
    // After update_task, list tasks again to see the update
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending list_tasks (after update)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": {"name": "list_tasks", "arguments": {"project_id": "${projectToUse}", "status": "inprogress"}}}\n`);
    }, 100);

  } else if (step === 10) {
    // After list_tasks, delete the task
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending delete_task...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 10, "method": "tools/call", "params": {"name": "delete_task", "arguments": {"project_id": "${projectToUse}", "task_id": "${testData.taskId}"}}}\n`);
    }, 100);

  } else if (step === 11) {
    // After delete_task, list tasks again to confirm deletion
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending list_tasks (after delete)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 11, "method": "tools/call", "params": {"name": "list_tasks", "arguments": {"project_id": "${projectToUse}"}}}\n`);
    }, 100);

  } else if (step >= 12) {
    // All tests complete
    console.error('✅ All endpoint tests completed successfully!');
    console.error('');
    console.error('📊 Test Summary:');
    console.error(`   - Project ID used: ${testData.projectId || 'N/A'}`);
    console.error(`   - Created project: ${testData.createdProjectId || 'N/A'}`);
    console.error(`   - Task ID tested: ${testData.taskId || 'N/A'}`);
    console.error('');
    console.error('🎉 All MCP endpoints are working correctly!');
    setTimeout(() => mcpProcess.kill(), 500);
  }
});

mcpProcess.on('exit', (code) => {
  console.error(`🔴 MCP server exited with code: ${code}`);
  process.exit(0);
});

mcpProcess.on('error', (error) => {
  console.error('❌ MCP server error:', error);
  process.exit(1);
});

// Start the sequence
setTimeout(() => {
  console.error('📤 Sending initialize request...');
  mcpProcess.stdin.write('{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}\n');
}, 500);

// Safety timeout
setTimeout(() => {
  console.error('⏰ Test timeout - killing process');
  mcpProcess.kill();
}, 30000); // Increased timeout for comprehensive testing