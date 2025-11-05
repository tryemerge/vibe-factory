import { memo, useMemo } from 'react';
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from 'reactflow';
import type { StationTransition } from 'shared/types';

type TransitionEdgeData = {
  transition?: StationTransition;
  sourcePosition?: number;
  targetPosition?: number;
  onEdit?: (transition: StationTransition) => void;
};

/**
 * Custom React Flow edge component for workflow station transitions.
 *
 * Features:
 * - Color-coded by condition type:
 *   - Green: on_approval
 *   - Red: on_failure
 *   - Blue: on_tests_pass
 *   - Yellow: on_tests_fail
 *   - Gray: default/no condition
 * - Loopback indicator (🔁) when target comes before source
 * - Clickable label to edit condition
 */
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
  }: EdgeProps<TransitionEdgeData>) => {
    const transition = data?.transition;
    const onEdit = data?.onEdit;

    // Determine if this is a loopback edge (target comes before source)
    const isLoopback = useMemo(() => {
      if (
        !transition ||
        data?.sourcePosition === undefined ||
        data?.targetPosition === undefined
      ) {
        return false;
      }
      // If target position is less than source position, it's a loopback
      return data.targetPosition < data.sourcePosition;
    }, [transition, data?.sourcePosition, data?.targetPosition]);

    // Determine edge color based on condition
    const edgeColor = useMemo(() => {
      if (!transition?.condition_type) {
        return '#6b7280'; // gray-500 - default
      }

      const conditionType = transition.condition_type.toLowerCase();
      switch (conditionType) {
        case 'on_approval':
          return '#22c55e'; // green-500
        case 'on_failure':
          return '#ef4444'; // red-500
        case 'on_tests_pass':
          return '#3b82f6'; // blue-500
        case 'on_tests_fail':
          return '#eab308'; // yellow-500
        default:
          return '#6b7280'; // gray-500
      }
    }, [transition?.condition_type]);

    // Calculate edge path
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    // Format label text
    const labelText = useMemo(() => {
      if (!transition) return null;

      const parts: string[] = [];

      // Add loopback indicator
      if (isLoopback) {
        parts.push('🔁');
      }

      // Add label or condition
      if (transition.label) {
        parts.push(transition.label);
      } else if (transition.condition_type) {
        // Format condition type for display (e.g., "on_approval" -> "On Approval")
        const formatted = transition.condition_type
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        parts.push(formatted);
      }

      return parts.length > 0 ? parts.join(' ') : null;
    }, [transition, isLoopback]);

    const handleLabelClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (transition && onEdit) {
        onEdit(transition);
      }
    };

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            ...style,
            stroke: edgeColor,
            strokeWidth: 2,
          }}
        />
        {labelText && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: 'all',
              }}
              className="nodrag nopan"
            >
              <button
                onClick={handleLabelClick}
                className="px-2 py-1 text-xs font-medium rounded-md shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                style={{
                  backgroundColor: 'white',
                  borderColor: edgeColor,
                  color: edgeColor,
                }}
              >
                {labelText}
              </button>
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }
);

TransitionEdge.displayName = 'TransitionEdge';
