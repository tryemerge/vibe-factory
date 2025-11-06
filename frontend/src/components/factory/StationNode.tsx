import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  Loader2,
  XCircle,
  Circle,
  User,
  FileText,
} from 'lucide-react';
import type { WorkflowStation, Agent } from 'shared/types';
import { cn } from '@/lib/utils';

export interface StationNodeData {
  station: WorkflowStation;
  agent?: Agent | null;
  status?: StationStatus;
}

export type StationStatus = 'idle' | 'running' | 'completed' | 'failed';

const statusConfig: Record<
  StationStatus,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    icon: React.ElementType;
    label: string;
  }
> = {
  idle: {
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
    icon: Circle,
    label: 'Idle',
  },
  running: {
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-400',
    icon: Loader2,
    label: 'Running',
  },
  completed: {
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-400',
    icon: CheckCircle,
    label: 'Completed',
  },
  failed: {
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-400',
    icon: XCircle,
    label: 'Failed',
  },
};

export const StationNode = memo(
  ({ data, selected }: NodeProps<StationNodeData>) => {
    const { station, agent, status = 'idle' } = data;
    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <div className="relative">
        {/* Input Handle (top) */}
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-gray-400 !border-2 !border-white !w-3 !h-3"
        />

        <Card
          className={cn(
            'min-w-[200px] max-w-[280px] transition-shadow duration-200',
            'cursor-grab active:cursor-grabbing',
            config.bgColor,
            config.borderColor,
            'border-2',
            selected && 'ring-2 ring-blue-500 ring-offset-2'
          )}
        >
          <CardHeader className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm font-semibold line-clamp-2 mb-1">
                  {station.name}
                </CardTitle>
                {station.description && (
                  <CardDescription className="text-xs line-clamp-2">
                    {station.description}
                  </CardDescription>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Icon
                  className={cn(
                    'h-4 w-4',
                    config.color,
                    status === 'running' && 'animate-spin'
                  )}
                />
              </div>
            </div>

            {/* Station Prompt */}
            {station.station_prompt && (
              <div className="mt-2 flex items-start gap-1">
                <FileText className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                <CardDescription className="text-xs line-clamp-2">
                  {station.station_prompt}
                </CardDescription>
              </div>
            )}

            {/* Agent Assignment */}
            {agent ? (
              <div className="mt-3 flex items-center gap-2">
                <User className="h-3 w-3 text-muted-foreground" />
                <Badge variant="secondary" className="text-xs font-normal">
                  {agent.name}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                  {agent.role}
                </span>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <User className="h-3 w-3 text-gray-400" />
                <Badge
                  variant="outline"
                  className="text-xs font-normal text-gray-400"
                >
                  No agent assigned
                </Badge>
              </div>
            )}

            {/* Status Badge (shown when not idle) */}
            {status !== 'idle' && (
              <div className="mt-2 flex items-center gap-1">
                <div
                  className={cn(
                    'h-2 w-2 rounded-full',
                    config.color.replace('text-', 'bg-')
                  )}
                />
                <span className={cn('text-xs font-medium', config.color)}>
                  {config.label}
                </span>
              </div>
            )}
          </CardHeader>
        </Card>

        {/* Output Handle (bottom) */}
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-gray-400 !border-2 !border-white !w-3 !h-3"
        />
      </div>
    );
  }
);

StationNode.displayName = 'StationNode';
