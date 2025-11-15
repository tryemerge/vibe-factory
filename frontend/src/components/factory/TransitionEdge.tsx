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
  isActive?: boolean;
};

/**
 * Custom React Flow edge component for workflow station transitions.
 *
 * Features:
 * - Color-coded by condition type:
 *   - Green: "always" or "on_approval"
 *   - Red: "on_failure" or "on_rejection"
 *   - Blue: "on_tests_pass"
 *   - Yellow: "on_tests_fail"
 *   - Gray: default/no condition
 * - Dashed lines for failure conditions (on_failure, on_rejection, on_tests_fail)
 * - Loopback indicator (🔁) when target comes before source
 * - Clickable edge and label to edit condition
 * - Animated pulse for active transitions
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
        case 'always':
        case 'on_approval':
          return '#22c55e'; // green-500
        case 'on_failure':
        case 'on_rejection':
          return '#ef4444'; // red-500
        case 'on_tests_pass':
          return '#3b82f6'; // blue-500
        case 'on_tests_fail':
          return '#eab308'; // yellow-500
        default:
          return '#6b7280'; // gray-500
      }
    }, [transition?.condition_type]);

    // Determine if this is a failure condition (uses dashed lines)
    const isFailureCondition = useMemo(() => {
      if (!transition?.condition_type) return false;
      const conditionType = transition.condition_type.toLowerCase();
      return (
        conditionType === 'on_failure' ||
        conditionType === 'on_rejection' ||
        conditionType === 'on_tests_fail'
      );
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

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (transition && onEdit) {
        onEdit(transition);
      }
    };

    const isActive = data?.isActive ?? false;

    return (
      <>
        {/* Visible edge - React Flow handles clicks via onEdgeClick prop */}
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            ...style,
            stroke: edgeColor,
            strokeWidth: 3,
            strokeDasharray: isFailureCondition ? '5,5' : undefined,
            animation: isActive
              ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              : undefined,
          }}
        />

        {/* Label or edit button at midpoint */}
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {labelText ? (
              <button
                onClick={handleClick}
                className="px-2 py-1 text-xs font-medium rounded-md shadow-sm border cursor-pointer hover:shadow-md transition-shadow bg-white"
                style={{
                  borderColor: edgeColor,
                  color: edgeColor,
                }}
              >
                {labelText}
              </button>
            ) : (
              <button
                onClick={handleClick}
                className="w-8 h-8 rounded-full border-2 bg-white shadow-lg hover:shadow-xl hover:scale-125 transition-all flex items-center justify-center"
                style={{
                  borderColor: edgeColor,
                  zIndex: 9999,
                }}
                title="Click to edit or delete transition"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: edgeColor,
                  }}
                />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
        <style>{`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        `}</style>
      </>
    );
  }
);

TransitionEdge.displayName = 'TransitionEdge';
