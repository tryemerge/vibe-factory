import { memo } from 'react';
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from 'reactflow';
import { StationTransition } from 'shared/types';
import { RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TransitionEdgeData extends Partial<StationTransition> {
  isLoopback?: boolean;
}

export const TransitionEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    data,
    selected,
  }: EdgeProps<TransitionEdgeData>) => {
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const isLoopback = data?.isLoopback || false;
    const conditionType = data?.condition_type || 'always';
    const label = data?.label;

    // Determine edge color based on condition type
    const getEdgeColor = () => {
      if (isLoopback) return 'hsl(var(--warning))';
      switch (conditionType) {
        case 'success':
          return 'hsl(var(--success))';
        case 'failure':
          return 'hsl(var(--destructive))';
        case 'conditional':
          return 'hsl(var(--primary))';
        case 'always':
        default:
          return 'hsl(var(--muted-foreground))';
      }
    };

    const edgeColor = getEdgeColor();

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            ...style,
            stroke: edgeColor,
            strokeWidth: selected ? 3 : 2,
            strokeDasharray: conditionType === 'conditional' ? '5,5' : undefined,
          }}
        />

        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div
              className={cn(
                'group flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium shadow-sm transition-all cursor-pointer',
                'bg-background border-2',
                selected
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/50',
                'hover:shadow-md'
              )}
              style={{ borderColor: edgeColor }}
            >
              {/* Loopback indicator */}
              {isLoopback && (
                <RefreshCcw className="h-3 w-3 shrink-0" style={{ color: edgeColor }} />
              )}

              {/* Label or condition type */}
              <span style={{ color: edgeColor }}>
                {label || getConditionLabel(conditionType)}
              </span>

              {/* Hover hint */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                <div className="bg-background text-xs px-2 py-1 rounded border shadow-sm">
                  Click to configure
                </div>
              </div>
            </div>
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }
);

TransitionEdge.displayName = 'TransitionEdge';

function getConditionLabel(conditionType: string): string {
  switch (conditionType) {
    case 'success':
      return 'On Success';
    case 'failure':
      return 'On Failure';
    case 'conditional':
      return 'Conditional';
    case 'always':
    default:
      return 'Always';
  }
}
