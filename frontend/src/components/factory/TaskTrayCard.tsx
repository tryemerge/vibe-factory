import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle, Loader2, XCircle, Play, Eye } from 'lucide-react';
import type { TaskWithAttemptStatus, Workflow } from 'shared/types';
import { cn } from '@/lib/utils';
import { workflowsApi } from '@/lib/api';
import { useExecuteWorkflow } from '@/hooks/useExecuteWorkflow';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';

type Task = TaskWithAttemptStatus;

interface TaskTrayCardProps {
  task: Task;
  horizontal?: boolean;
  projectId?: string;
}

export function TaskTrayCard({
  task,
  horizontal = false,
  projectId,
}: TaskTrayCardProps) {
  const navigate = useNavigateWithSearch();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const { executeWorkflow, isExecuting, error } = useExecuteWorkflow();

  // Get the latest attempt for the task to enable "View Execution" navigation
  const { data: attempts = [] } = useTaskAttempts(task.id, {
    enabled: task.has_in_progress_attempt,
    refetchInterval: 3000,
  });

  // Get the most recent attempt (sorted by created_at desc)
  const latestAttempt =
    attempts.length > 0
      ? [...attempts].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
      : undefined;

  // Load workflows for the project
  useEffect(() => {
    if (!projectId || task.status !== 'todo') return;

    const loadWorkflows = async () => {
      setIsLoadingWorkflows(true);
      try {
        const projectWorkflows = await workflowsApi.getByProjectId(projectId);
        setWorkflows(projectWorkflows);

        // Auto-select the first workflow if available
        if (projectWorkflows.length > 0 && !selectedWorkflowId) {
          setSelectedWorkflowId(projectWorkflows[0].id);
        }
      } catch (err) {
        console.error('Failed to load workflows:', err);
      } finally {
        setIsLoadingWorkflows(false);
      }
    };

    loadWorkflows();
  }, [projectId, task.status, selectedWorkflowId]);

  const handleStartWorkflow = async () => {
    if (!selectedWorkflowId) return;

    await executeWorkflow(selectedWorkflowId, {
      task_id: task.id,
      base_branch: 'master', // TODO: Make this configurable or get from project settings
      executor_profile_id: null, // Use default executor
    });

    // Note: Task status update (todo → inprogress) is handled automatically
    // by the backend when workflow execution starts (via start_attempt() flow).
    // The UI will update via the polling/refetch mechanism.
  };

  const hasWorkflows = workflows.length > 0;
  const showWorkflowControls = task.status === 'todo' && hasWorkflows;
  const hasActiveWorkflow = task.has_in_progress_attempt;

  return (
    <Card
      className={cn(
        'p-3 hover:shadow-md transition-shadow',
        horizontal ? 'min-w-[200px] h-full' : 'w-full',
        !showWorkflowControls &&
          !hasActiveWorkflow &&
          'cursor-grab active:cursor-grabbing'
      )}
    >
      <div className="flex flex-col gap-2 h-full">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-sm line-clamp-2 flex-1">
            {task.title}
          </h4>
          <div className="flex items-center space-x-1 shrink-0">
            {/* In Progress Spinner */}
            {task.has_in_progress_attempt && (
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
            )}
            {/* Merged Indicator */}
            {task.has_merged_attempt && (
              <CheckCircle className="h-3 w-3 text-green-500" />
            )}
            {/* Failed Indicator */}
            {task.last_attempt_failed && !task.has_merged_attempt && (
              <XCircle className="h-3 w-3 text-destructive" />
            )}
          </div>
        </div>
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Workflow Controls */}
        {showWorkflowControls && (
          <div className="flex flex-col gap-2 mt-2 pt-2 border-t">
            <Select
              value={selectedWorkflowId}
              onValueChange={setSelectedWorkflowId}
              disabled={isLoadingWorkflows || isExecuting}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select workflow..." />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((workflow) => (
                  <SelectItem
                    key={workflow.id}
                    value={workflow.id}
                    className="text-xs"
                  >
                    {workflow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleStartWorkflow}
              disabled={!selectedWorkflowId || isExecuting}
              className="h-7 text-xs"
            >
              <Play className="h-3 w-3 mr-1" />
              {isExecuting ? 'Starting...' : 'Start Workflow'}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        {/* View Execution Button (when task is running) */}
        {hasActiveWorkflow && latestAttempt && projectId && (
          <div className="mt-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigate(
                  paths.factoryAttempt(projectId, task.id, latestAttempt.id)
                );
              }}
              className="h-7 text-xs w-full"
            >
              <Eye className="h-3 w-3 mr-1" />
              View Execution
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
