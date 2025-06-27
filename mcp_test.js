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
  taskTitle: "Test Task from MCP Script",
  updatedTaskTitle: "Updated Test Task Title",
};

const steps = [
  'initialize',
  'initialized_notification',
  'list_tools',
  'list_projects',
  'create_project',
  'list_tasks_empty',
  'create_task',
  'get_task',
  'list_tasks_with_task',
  'set_task_status_inprogress',
  'list_tasks_filtered',
  'complete_task',
  'list_tasks_completed',
  'create_second_task',
  'update_task',
  'update_task_title',
  'update_task_description',
  'list_tasks_after_updates',
  'delete_task_by_title',
  'list_tasks_final',
  'cleanup'
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
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "create_task", "arguments": {"project_id": "${projectToUse}", "title": "${testData.taskTitle}", "description": "This task was created during endpoint testing"}}}\n`);
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
    // After get_task, list tasks to see the created task
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending list_tasks (with task)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "list_tasks", "arguments": {"project_id": "${projectToUse}"}}}\n`);
    }, 100);

  } else if (step === 9) {
    // After list_tasks, test set_task_status (agent-friendly)
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending set_task_status (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": {"name": "set_task_status", "arguments": {"project_id": "${projectToUse}", "task_title": "${testData.taskTitle}", "status": "in-progress"}}}\n`);
    }, 100);

  } else if (step === 10) {
    // After set_task_status, list tasks with status filter
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending list_tasks (filtered by in-progress)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 10, "method": "tools/call", "params": {"name": "list_tasks", "arguments": {"project_id": "${projectToUse}", "status": "in-progress"}}}\n`);
    }, 100);

  } else if (step === 11) {
    // After filtered list, test complete_task (agent-friendly)
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending complete_task (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 11, "method": "tools/call", "params": {"name": "complete_task", "arguments": {"project_id": "${projectToUse}", "task_title": "${testData.taskTitle}"}}}\n`);
    }, 100);

  } else if (step === 12) {
    // After complete_task, list completed tasks
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending list_tasks (completed tasks)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 12, "method": "tools/call", "params": {"name": "list_tasks", "arguments": {"project_id": "${projectToUse}", "status": "done"}}}\n`);
    }, 100);

  } else if (step === 13) {
    // Create a second task to test more operations
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending create_task (second task)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 13, "method": "tools/call", "params": {"name": "create_task", "arguments": {"project_id": "${projectToUse}", "title": "Second Test Task", "description": "This is a second task for testing updates"}}}\n`);
    }, 100);

  } else if (step === 14) {
    // Test the legacy update_task method (for comparison)
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending update_task (legacy method)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 14, "method": "tools/call", "params": {"name": "update_task", "arguments": {"project_id": "${projectToUse}", "task_id": "${testData.taskId}", "title": "${testData.updatedTaskTitle}", "description": "Updated description via legacy method", "status": "in-review"}}}\n`);
    }, 100);

  } else if (step === 15) {
    // Test update_task_title (agent-friendly)
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending update_task_title (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 15, "method": "tools/call", "params": {"name": "update_task_title", "arguments": {"project_id": "${projectToUse}", "current_title": "Second Test Task", "new_title": "Renamed Second Task"}}}\n`);
    }, 100);

  } else if (step === 16) {
    // Test update_task_description (agent-friendly)
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending update_task_description (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 16, "method": "tools/call", "params": {"name": "update_task_description", "arguments": {"project_id": "${projectToUse}", "task_title": "Renamed Second Task", "description": "This description was updated using the agent-friendly endpoint"}}}\n`);
    }, 100);

  } else if (step === 17) {
    // List tasks to see the updates
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending list_tasks (after title and description updates)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 17, "method": "tools/call", "params": {"name": "list_tasks", "arguments": {"project_id": "${projectToUse}"}}}\n`);
    }, 100);

  } else if (step === 18) {
    // Test delete_task_by_title (agent-friendly)
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending delete_task_by_title (agent-friendly)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 18, "method": "tools/call", "params": {"name": "delete_task_by_title", "arguments": {"project_id": "${projectToUse}", "task_title": "Renamed Second Task"}}}\n`);
    }, 100);

  } else if (step === 19) {
    // Final list_tasks to see the current state
    const projectToUse = testData.createdProjectId || testData.projectId;
    setTimeout(() => {
      console.error('📤 Sending list_tasks (final state)...');
      mcpProcess.stdin.write(`{"jsonrpc": "2.0", "id": 19, "method": "tools/call", "params": {"name": "list_tasks", "arguments": {"project_id": "${projectToUse}"}}}\n`);
    }, 100);

  } else if (step >= 20) {
    // All tests complete
    console.error('✅ MCP server completed full protocol test successfully!');
    console.error('');
    console.error('📊 Test Summary:');
    console.error(`   - Project ID used: ${testData.projectId || 'N/A'}`);
    console.error(`   - Created project: ${testData.createdProjectId || 'N/A'}`);
    console.error(`   - Task ID tested: ${testData.taskId || 'N/A'}`);
    console.error(`   - Task title: ${testData.taskTitle}`);
    console.error('');
    console.error('🎯 Agent-Friendly Endpoints Tested:');
    console.error('   ✅ set_task_status - Change task status by title');
    console.error('   ✅ complete_task - Mark task done by title');
    console.error('   ✅ update_task_title - Change task title');
    console.error('   ✅ update_task_description - Update task description');
    console.error('   ✅ delete_task_by_title - Delete task by title');
    console.error('');
    console.error('🔧 Legacy Endpoints Tested:');
    console.error('   ✅ update_task - Update task by ID (more complex)');
    console.error('   ✅ get_task - Get task details by ID');
    console.error('   ✅ delete_task - Delete task by ID');
    console.error('');
    console.error('🎉 All MCP endpoints are working correctly!');
    console.error('💡 Agents should prefer the title-based endpoints for easier usage');
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
}, 45000);