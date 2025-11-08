import { Card } from '@/components/ui/card';
import { Loader2, Workflow, User } from 'lucide-react';
import type { TaskWithAttemptStatus, WorkflowStation, Agent, WorkflowExecutionDetailsResponse } from 'shared/types';
import { cn } from '@/lib/utils';

interface InProgressTaskCardProps {
  task: TaskWithAttemptStatus;
  execution: WorkflowExecutionDetailsResponse;
  currentStation: WorkflowStation | null;
  agent: Agent | null;
  onSelect?: (taskId: string) => void;
}

export function InProgressTaskCard({
  task,
  execution,
  currentStation,
  agent,
  onSelect,
}: InProgressTaskCardProps) {
  return (
    <Card
      className={cn(
        'p-3 hover:shadow-md transition-shadow cursor-pointer',
        'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20'
      )}
      onClick={() => onSelect?.(task.id)}
    >
      <div className="flex flex-col gap-2">
        {/* Task title with spinner */}
        <div className="flex items-start gap-2">
          <Loader2 className="h-4 w-4 text-blue-500 shrink-0 animate-spin mt-0.5" />
          <h4 className="font-medium text-sm line-clamp-2 flex-1">
            {task.title}
          </h4>
        </div>

        {/* Current station */}
        {currentStation && (
          <div className="flex items-center gap-1.5 text-xs">
            <Workflow className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-muted-foreground truncate">
              {currentStation.name}
            </span>
          </div>
        )}

        {/* Agent */}
        {agent && (
          <div className="flex items-center gap-1.5 text-xs">
            <User className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-muted-foreground truncate">
              {agent.name}
            </span>
          </div>
        )}

        {/* Execution status */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-blue-600 dark:text-blue-400 font-medium">
            {execution.status}
          </span>
        </div>
      </div>
    </Card>
  );
}
