import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useProject } from '@/contexts/project-context';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { TaskTrayCard } from '@/components/factory/TaskTrayCard';

type Task = TaskWithAttemptStatus;

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

export function FactoryFloorPage() {
  const {
    projectId,
    isLoading: projectLoading,
    error: projectError,
  } = useProject();
  const { tasks, isLoading: tasksLoading } = useProjectTasks(projectId || '');

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Split tasks into todo and in progress
  const { todoTasks, inProgressTasks } = useMemo(() => {
    const todo: Task[] = [];
    const inProgress: Task[] = [];

    tasks.forEach((task) => {
      const status = task.status.toLowerCase();
      if (status === 'todo') {
        todo.push(task);
      } else if (status === 'inprogress') {
        inProgress.push(task);
      }
    });

    return { todoTasks: todo, inProgressTasks: inProgress };
  }, [tasks]);

  if (projectError) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Error
          </AlertTitle>
          <AlertDescription>
            {projectError.message || 'Failed to load project'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (projectLoading || tasksLoading) {
    return (
      <Loader message="Loading factory floor..." size={32} className="py-8" />
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card shrink-0">
        <h1 className="text-2xl font-bold">Factory Floor</h1>
      </div>

      {/* Main content area with trays and canvas */}
      <div className="flex-1 min-h-0 flex">
        {/* Left Tray - Todo Tasks */}
        <div className="w-64 border-r bg-muted/30 flex flex-col shrink-0">
          <div className="p-3 border-b bg-card">
            <h2 className="font-semibold text-sm">Todo Tasks</h2>
            <p className="text-xs text-muted-foreground">
              {todoTasks.length} tasks
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {todoTasks.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground p-4">
                No todo tasks
              </div>
            ) : (
              todoTasks.map((task) => (
                <TaskTrayCard key={task.id} task={task} />
              ))
            )}
          </div>
        </div>

        {/* Center - React Flow Canvas */}
        <div className="flex-1 min-w-0 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            panOnScroll
            zoomOnScroll
            fitView
          >
            <Controls />
            <MiniMap />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>
        </div>
      </div>

      {/* Bottom Tray - In Progress Tasks */}
      <div className="h-32 border-t bg-muted/30 flex flex-col shrink-0">
        <div className="px-3 py-2 border-b bg-card">
          <h2 className="font-semibold text-sm">In Progress</h2>
          <p className="text-xs text-muted-foreground">
            {inProgressTasks.length} tasks
          </p>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-2">
          <div className="flex gap-2 h-full">
            {inProgressTasks.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground p-4 w-full">
                No tasks in progress
              </div>
            ) : (
              inProgressTasks.map((task) => (
                <TaskTrayCard key={task.id} task={task} horizontal />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
