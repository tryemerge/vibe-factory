import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, XCircle, Circle, User, FlagTriangleRight, Edit2, Trash2 } from 'lucide-react';
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
  onEdit?: (stationId: string) => void;
  onDelete?: (stationId: string) => void;
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
    const { station, agent, status = 'idle', activeTasks = [], onEdit, onDelete } = data;
    const config = statusConfig[status];
    const Icon = config.icon;
    const hasActiveTasks = activeTasks.length > 0;
    const [isHovered, setIsHovered] = useState(false);

    const handleEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit?.(station.id);
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm(`Delete station "${station.name}"?`)) {
        onDelete?.(station.id);
      }
    };

    return (
      <div
        className="relative group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Input Handle (left) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-primary !w-3 !h-3 !border-2 !border-background hover:!bg-primary/80 hover:!w-4 hover:!h-4 transition-all !cursor-crosshair"
          style={{ zIndex: 100 }}
        />

        {/* Action Buttons - show on hover */}
        {isHovered && (onEdit || onDelete) && (
          <div className="nodrag absolute -top-2 -right-2 flex gap-1 z-10">
            {onEdit && (
              <Button
                size="icon"
                variant="secondary"
                className="h-6 w-6 rounded-full shadow-md hover:shadow-lg transition-all"
                onClick={handleEdit}
                title="Edit station"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                size="icon"
                variant="destructive"
                className="h-6 w-6 rounded-full shadow-md hover:shadow-lg transition-all"
                onClick={handleDelete}
                title="Delete station"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        <Card
          className={cn(
            'min-w-[240px] max-w-[320px]',
            'cursor-grab active:cursor-grabbing',
            'border-2 shadow-sm',
            'bg-card',
            'transition-all duration-200',
            'hover:shadow-lg',
            selected && 'ring-2 ring-primary shadow-lg',
            hasActiveTasks && 'ring-2 ring-blue-500 border-blue-300 dark:border-blue-700 shadow-lg shadow-blue-200/50 dark:shadow-blue-900/50',
            station.is_terminator && 'border-green-500',
            !hasActiveTasks && !station.is_terminator && 'border-border'
          )}
        >
          <CardHeader className="p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <h4 className="text-base font-semibold line-clamp-1 text-foreground">
                  {station.name}
                </h4>
                {station.is_terminator && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 shrink-0">
                    <FlagTriangleRight className="h-3 w-3 text-green-700 dark:text-green-400" />
                    <span className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">
                      End
                    </span>
                  </div>
                )}
              </div>
              {status !== 'idle' && (
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
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
              <div className="flex items-center gap-2 px-2 py-1 bg-muted/50 rounded-md">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground truncate">
                  {agent.name}
                </span>
              </div>
            )}

            {/* Station Prompt */}
            {station.station_prompt && !hasActiveTasks && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {station.station_prompt}
              </p>
            )}
          </CardHeader>
        </Card>

        {/* Output Handle (right) */}
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-primary !w-3 !h-3 !border-2 !border-background hover:!bg-primary/80 hover:!w-4 hover:!h-4 transition-all !cursor-crosshair"
          style={{ zIndex: 100 }}
        />
      </div>
    );
  }
);

StationNode.displayName = 'StationNode';
