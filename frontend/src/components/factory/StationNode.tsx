import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, CardHeader } from '@/components/ui/card';
import { CheckCircle, Loader2, XCircle, Circle, User } from 'lucide-react';
import type { WorkflowStation, Agent } from 'shared/types';
import { cn } from '@/lib/utils';

export interface StationNodeData {
  station: WorkflowStation;
  agent?: Agent | null;
  status?: StationStatus;
  activeTasks?: Array<{
    id: string;
    title: string;
  }>;
}

export type StationStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

const statusConfig: Record<
  StationStatus,
  {
    color: string;
    icon: React.ElementType;
    label: string;
    pulse?: boolean;
  }
> = {
  idle: {
    color: 'text-muted-foreground',
    icon: Circle,
    label: 'Idle',
  },
  pending: {
    color: 'text-yellow-500',
    icon: Circle,
    label: 'Pending',
    pulse: true,
  },
  running: {
    color: 'text-blue-500',
    icon: Loader2,
    label: 'Running',
  },
  completed: {
    color: 'text-green-500',
    icon: CheckCircle,
    label: 'Completed',
  },
  failed: {
    color: 'text-destructive',
    icon: XCircle,
    label: 'Failed',
  },
};

export const StationNode = memo(
  ({ data, selected }: NodeProps<StationNodeData>) => {
    const { station, agent, status = 'idle', activeTasks = [] } = data;
    const config = statusConfig[status];
    const Icon = config.icon;
    const hasActiveTasks = activeTasks.length > 0;

    return (
      <div className="relative">
        {/* Input Handle (left) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-border !w-2 !h-2 !border-0"
        />

        <Card
          className={cn(
            'min-w-[220px] max-w-[320px]',
            'cursor-grab active:cursor-grabbing',
            'border',
            'bg-card',
            selected && 'ring-2 ring-primary ring-inset',
            hasActiveTasks && 'ring-2 ring-blue-500'
          )}
        >
          <CardHeader className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium line-clamp-1 text-foreground">
                  {station.name}
                </h4>
              </div>
              {status !== 'idle' && (
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    config.color,
                    status === 'running' && 'animate-spin',
                    config.pulse && 'animate-pulse'
                  )}
                />
              )}
            </div>

            {/* Active Tasks */}
            {hasActiveTasks && (
              <div className="space-y-1">
                {activeTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-1.5 p-1.5 bg-blue-50 dark:bg-blue-950 rounded text-xs border border-blue-200 dark:border-blue-800"
                  >
                    <Loader2 className="h-3 w-3 text-blue-500 shrink-0 animate-spin" />
                    <span className="text-blue-700 dark:text-blue-300 truncate font-medium">
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Agent Assignment */}
            {agent && (
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground truncate">
                  {agent.name}
                </span>
              </div>
            )}

            {/* Station Prompt */}
            {station.station_prompt && !hasActiveTasks && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {station.station_prompt}
              </p>
            )}
          </CardHeader>
        </Card>

        {/* Output Handle (right) */}
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-border !w-2 !h-2 !border-0"
        />
      </div>
    );
  }
);

StationNode.displayName = 'StationNode';
