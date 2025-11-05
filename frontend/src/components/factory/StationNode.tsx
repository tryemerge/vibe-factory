import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { WorkflowStation } from 'shared/types';
import { Bot, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StationNodeData extends WorkflowStation {
  agentName?: string;
  selected?: boolean;
}

export const StationNode = memo(({ data, selected }: NodeProps<StationNodeData>) => {
  const hasAgent = Boolean(data.agent_id);

  return (
    <div
      className={cn(
        'group relative min-w-[200px] bg-card border-2 rounded-lg shadow-md transition-all',
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border hover:border-primary/50',
        'hover:shadow-lg'
      )}
    >
      {/* Handles for connections */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !w-3 !h-3 !border-2 !border-background"
      />

      {/* Station Content */}
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{data.name}</h3>
            <div className="text-xs text-muted-foreground">
              Position: {String(data.position)}
            </div>
          </div>
          <div className="shrink-0">
            <Settings className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Agent Info */}
        {hasAgent && data.agentName ? (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded text-xs">
            <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{data.agentName}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
            <Bot className="h-3.5 w-3.5 shrink-0" />
            <span>No agent assigned</span>
          </div>
        )}

        {/* Description */}
        {data.description && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
            {data.description}
          </p>
        )}

        {/* Output Context Keys Badge */}
        {data.output_context_keys && (
          <div className="mt-2 flex flex-wrap gap-1">
            {JSON.parse(data.output_context_keys).map(
              (key: string, i: number) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded"
                >
                  {key}
                </span>
              )
            )}
          </div>
        )}
      </div>

      {/* Hover overlay hint */}
      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-background text-xs px-2 py-1 rounded border shadow-sm whitespace-nowrap">
          Click to configure
        </div>
      </div>
    </div>
  );
});

StationNode.displayName = 'StationNode';
