import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Settings, Eye } from 'lucide-react';
import { makeRequest } from '@/lib/api';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';
import { ProjectForm } from '@/components/projects/project-form';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts';
import { useConfig } from '@/components/config-provider';
import {
  getMainContainerClasses,
  getKanbanSectionClasses,
} from '@/lib/responsive-config';

import { TaskKanbanBoard } from '@/components/tasks/TaskKanbanBoard';
import { TaskDetailsPanel } from '@/components/tasks/TaskDetailsPanel';
import type {
  TaskStatus,
  TaskWithAttemptStatus,
  ProjectWithBranch,
  ExecutorConfig,
  CreateTaskAndStart,
} from 'shared/types';
import type { DragEndEvent } from '@/components/ui/shadcn-io/kanban';

type Task = TaskWithAttemptStatus;

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
}

export function ProjectTasks() {
  const { projectId, taskId } = useParams<{
    projectId: string;
    taskId?: string;
  }>();
  const navigate = useNavigate();
  const { config } = useConfig();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [project, setProject] = useState<ProjectWithBranch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);

  // Panel state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Define task creation handler
  const handleCreateNewTask = () => {
    setEditingTask(null);
    setIsTaskDialogOpen(true);
  };

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    navigate,
    currentPath: `/projects/${projectId}/tasks`,
    hasOpenDialog: isTaskDialogOpen,
    closeDialog: () => setIsTaskDialogOpen(false),
    openCreateTask: handleCreateNewTask,
  });

  useEffect(() => {
    if (projectId) {
      fetchProject();
      fetchTasks();

      // Set up polling to refresh tasks every 5 seconds
      const interval = setInterval(() => {
        fetchTasks(true); // Skip loading spinner for polling
      }, 2000);

      // Cleanup interval on unmount
      return () => clearInterval(interval);
    }
  }, [projectId]);

  // Handle direct navigation to task URLs
  useEffect(() => {
    if (taskId && tasks.length > 0) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        setSelectedTask(task);
        setIsPanelOpen(true);
      }
    }
  }, [taskId, tasks]);

  const fetchProject = async () => {
    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/with-branch`
      );

      if (response.ok) {
        const result: ApiResponse<ProjectWithBranch> = await response.json();
        if (result.success && result.data) {
          setProject(result.data);
        }
      } else if (response.status === 404) {
        setError('Project not found');
        navigate('/projects');
      }
    } catch (err) {
      setError('Failed to load project');
    }
  };

  const fetchTasks = async (skipLoading = false) => {
    try {
      if (!skipLoading) {
        setLoading(true);
      }
      const response = await makeRequest(`/api/projects/${projectId}/tasks`);

      if (response.ok) {
        const result: ApiResponse<Task[]> = await response.json();
        if (result.success && result.data) {
          // Only update if data has actually changed
          setTasks((prevTasks) => {
            const newTasks = result.data!;
            if (JSON.stringify(prevTasks) === JSON.stringify(newTasks)) {
              return prevTasks; // Return same reference to prevent re-render
            }

            // Update selectedTask if it exists and has been modified
            if (selectedTask) {
              const updatedSelectedTask = newTasks.find(
                (task) => task.id === selectedTask.id
              );
              if (
                updatedSelectedTask &&
                JSON.stringify(selectedTask) !==
                JSON.stringify(updatedSelectedTask)
              ) {
                setSelectedTask(updatedSelectedTask);
              }
            }

            return newTasks;
          });
        }
      } else {
        setError('Failed to load tasks');
      }
    } catch (err) {
      setError('Failed to load tasks');
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  };

  const handleCreateTask = async (title: string, description: string) => {
    try {
      const response = await makeRequest(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          title,
          description: description || null,
        }),
      });

      if (response.ok) {
        await fetchTasks();
      } else {
        setError('Failed to create task');
      }
    } catch (err) {
      setError('Failed to create task');
    }
  };

  const handleCreateAndStartTask = async (
    title: string,
    description: string,
    executor?: ExecutorConfig
  ) => {
    try {
      const payload: CreateTaskAndStart = {
        project_id: projectId!,
        title,
        description: description || null,
        executor: executor || null,
      };

      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/create-and-start`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        await fetchTasks();
      } else {
        setError('Failed to create and start task');
      }
    } catch (err) {
      setError('Failed to create and start task');
    }
  };

  const handleCreateInitTask = async () => {
    await handleCreateAndStartTask('/init', '', config?.executor);
  };

  const handleVisualise = async () => {
    if (!project) return;

    try {
      // Check if UML.md exists in the project
      const response = await makeRequest(
        `/api/filesystem/read-file?project_path=${encodeURIComponent(project.git_repo_path)}&file_name=UML.md`
      );

      if (response.ok) {
        const result: ApiResponse<string> = await response.json();
        if (result.success && result.data) {
          // UML.md exists, navigate to diagram viewer
          navigate(`/projects/${projectId}/diagrams`);
          return;
        }
      }

      // UML.md doesn't exist, create visualization task
      const visualisePrompt = `You are an enterprise architect tasked with creating Mermaid diagrams to represent the functionalities and flows of a codebase for non-technical stakeholders. These diagrams will be used to review the codebase before approving its migration. It's crucial that your diagrams accurately capture the business logic and structure without omitting or adding any information, as the migrated code will be based on these diagrams.

Carefully examine the provided codebase. Pay attention to:
1. The overall structure of the code
2. Functions and their relationships
3. Data flow between different components
4. Business logic implemented in the code
5. Any important conditionals or loops that affect the flow

Create a series of Mermaid diagrams that represent the functionalities and flows found in the codebase. Your diagrams should:
1. Accurately represent the business logic without omissions or additions
2. Show the relationships between different components
3. Illustrate the data flow through the system
4. Highlight any critical decision points or processes

Use appropriate Mermaid diagram types such as flowcharts, sequence diagrams, or class diagrams as needed to best represent different aspects of the codebase.

CRITICAL MERMAID SYNTAX REQUIREMENTS:
- Ensure all brackets [], parentheses (), and braces {} are correctly opened and closed on the same line
- NEVER use reserved words 'end', 'class', 'style', or 'subgraph' at the end of node identifiers or text (e.g., use 'finish' instead of 'end')
- Do not begin node text with a single 'o' or 'x' character followed by a space, as it can be misinterpreted as an edge type
- When defining node text with quotes, escape them using &quot; instead of "
- All flowchart definitions must start with 'graph TD;', 'graph LR;', etc. - do not mix syntax from other diagram types
- Use descriptive but concise node labels that avoid problematic patterns
- Wrap all node labels in double quotes "..."

Example of valid Mermaid syntax:
\`\`\`mermaid
graph TD;
    A["Start Process"] --> B{"Is Valid?"};
    B -- Yes --> C["Process Data"];
    C --> D["Complete Task"];
    B -- No --> E["Handle Error"];
    E --> F["Finish"];
\`\`\`

Write all of your diagrams to a single markdown file called UML.md. For each diagram:
1. Start with a brief textual explanation of what the diagram represents
2. Follow with the Mermaid diagram code inside a markdown code block with the \`\`\`mermaid tag
3. Ensure that each diagram is clear, concise, and focuses on a specific aspect of the codebase
4. Test your syntax mentally against the rules above before including it

Remember:
- Do not omit any business logic from the diagrams
- Do not add anything superfluous that isn't represented in the original codebase
- Use clear and descriptive labels in your diagrams that follow Mermaid best practices
- If necessary, add brief textual explanations between diagrams to provide context or clarification

Your final output should be the complete contents of the UML.md file, including all textual explanations and Mermaid diagram code blocks. Do not include any additional commentary or explanations outside of what should be in the UML.md file.`;
      await handleCreateAndStartTask(
        'Visualise Application',
        visualisePrompt,
        config?.executor
      );
    } catch (err) {
      console.error('Error checking for UML.md', err);
    }
  };

  // Check if there's an init task in progress
  const hasInitInProgress = tasks.some(
    (task) => task.title === '/init' && task.has_in_progress_attempt
  );

  const handleUpdateTask = async (
    title: string,
    description: string,
    status: TaskStatus
  ) => {
    if (!editingTask) return;

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${editingTask.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title,
            description: description || null,
            status,
          }),
        }
      );

      if (response.ok) {
        await fetchTasks();
        setEditingTask(null);
      } else {
        setError('Failed to update task');
      }
    } catch (err) {
      setError('Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${taskId}`,
        {
          method: 'DELETE',
        }
      );

      if (response.ok) {
        await fetchTasks();
      } else {
        setError('Failed to delete task');
      }
    } catch (err) {
      setError('Failed to delete task');
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsTaskDialogOpen(true);
  };

  const handleViewTaskDetails = (task: Task) => {
    setSelectedTask(task);
    setIsPanelOpen(true);
    // Update URL to include task ID
    navigate(`/projects/${projectId}/tasks/${task.id}`, { replace: true });
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setSelectedTask(null);
    // Remove task ID from URL when closing panel
    navigate(`/projects/${projectId}/tasks`, { replace: true });
  };

  const handleProjectSettingsSuccess = () => {
    setIsProjectSettingsOpen(false);
    fetchProject(); // Refresh project data after settings change
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !active.data.current) return;

    const taskId = active.id as string;
    const newStatus = over.id as Task['status'];
    const task = tasks.find((t) => t.id === taskId);

    if (!task || task.status === newStatus) return;

    // Optimistically update the UI immediately
    const previousStatus = task.status;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${taskId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title: task.title,
            description: task.description,
            status: newStatus,
          }),
        }
      );

      if (!response.ok) {
        // Revert the optimistic update if the API call failed
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, status: previousStatus } : t
          )
        );
        setError('Failed to update task status');
      }
    } catch (err) {
      // Revert the optimistic update if the API call failed
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: previousStatus } : t
        )
      );
      setError('Failed to update task status');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading tasks...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-destructive">{error}</div>;
  }

  return (
    <div className={getMainContainerClasses(isPanelOpen)}>
      {/* Left Column - Kanban Section */}
      <div className={getKanbanSectionClasses(isPanelOpen)}>
        {/* Header */}

        <div className="px-8 my-12 flex flex-row">
          <div className="w-full flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project?.name || 'Project'}</h1>
            {project?.current_branch && (
              <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-md">
                {project.current_branch}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsProjectSettingsOpen(true)}
              className="h-8 w-8 p-0"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleVisualise}>
              <Eye className="h-4 w-4 mr-2" />
              Visualise
            </Button>
            <Button onClick={handleCreateNewTask}>
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>

        {/* Tasks View */}
        {tasks.length === 0 ? (
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-muted-foreground">
                  No tasks found for this project.
                </p>
                <Button className="mt-4" onClick={handleCreateNewTask}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Task
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="px-8 overflow-x-scroll my-4">
            <div className="min-w-[900px] max-w-[2000px] relative py-1">
              <TaskKanbanBoard
                tasks={tasks}
                onDragEnd={handleDragEnd}
                onEditTask={handleEditTask}
                onDeleteTask={handleDeleteTask}
                onViewTaskDetails={handleViewTaskDetails}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right Column - Task Details Panel */}
      {isPanelOpen && (
        <TaskDetailsPanel
          task={selectedTask}
          project={project}
          projectId={projectId!}
          isOpen={isPanelOpen}
          onClose={handleClosePanel}
          onEditTask={handleEditTask}
          onDeleteTask={handleDeleteTask}
          isDialogOpen={isTaskDialogOpen || isProjectSettingsOpen}
        />
      )}

      {/* Dialogs - rendered at main container level to avoid stacking issues */}
      <TaskFormDialog
        isOpen={isTaskDialogOpen}
        onOpenChange={setIsTaskDialogOpen}
        task={editingTask}
        projectId={projectId}
        onCreateTask={handleCreateTask}
        onCreateAndStartTask={handleCreateAndStartTask}
        onUpdateTask={handleUpdateTask}
        onCreateInitTask={handleCreateInitTask}
        hasInitInProgress={hasInitInProgress}
      />

      <ProjectForm
        open={isProjectSettingsOpen}
        onClose={() => setIsProjectSettingsOpen(false)}
        onSuccess={handleProjectSettingsSuccess}
        project={project}
      />
    </div>
  );
}
