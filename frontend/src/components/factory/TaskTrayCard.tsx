import { Card } from '@/components/ui/card';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import type { TaskWithAttemptStatus } from 'shared/types';
import { cn } from '@/lib/utils';

type Task = TaskWithAttemptStatus;

interface TaskTrayCardProps {
  task: Task;
  horizontal?: boolean;
}

export function TaskTrayCard({ task, horizontal = false }: TaskTrayCardProps) {
  return (
    <Card
      className={cn(
        'p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow',
        horizontal ? 'min-w-[200px] h-full' : 'w-full'
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
      </div>
    </Card>
  );
}
