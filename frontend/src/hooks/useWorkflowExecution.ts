import { useQuery } from '@tanstack/react-query';
import { workflowExecutionsApi } from '@/lib/api';
import type {
  WorkflowExecutionDetailsResponse,
  StationExecutionSummary,
} from 'shared/types';

interface UseWorkflowExecutionOptions {
  executionId?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}

/**
 * Hook to monitor workflow execution status (READ-ONLY)
 *
 * ⚠️ NOTE: This is different from PR #37's useWorkflowExecution
 * - PR #37: Action hook for EXECUTING workflows (POST request)
 * - This hook: Monitoring hook for READING execution status (GET request + polling)
 *
 * Provides real-time updates on:
 * - Overall workflow execution status
 * - Current station being executed
 * - Individual station execution states
 *
 * Use with polling (refetchInterval) for real-time updates during execution
 *
 * Example:
 * ```tsx
 * const { stationStatusMap, progress, isRunning } = useWorkflowExecution({
 *   executionId: 'uuid-here',
 *   enabled: true,
 *   refetchInterval: 2000, // Poll every 2 seconds
 * });
 * ```
 */
export function useWorkflowExecution({
  executionId,
  enabled = true,
  refetchInterval = false,
}: UseWorkflowExecutionOptions) {
  const {
    data: execution,
    isLoading,
    error,
    refetch,
  } = useQuery<WorkflowExecutionDetailsResponse>({
    queryKey: ['workflow-execution', executionId],
    queryFn: () => {
      if (!executionId) {
        throw new Error('Execution ID is required');
      }
      return workflowExecutionsApi.getById(executionId);
    },
    enabled: enabled && !!executionId,
    refetchInterval,
    // Keep previous data while refetching for smooth transitions
    placeholderData: (previousData: WorkflowExecutionDetailsResponse | undefined) => previousData,
  });

  /**
   * Map station executions to a lookup by station ID
   * This allows quick access to station status by station ID
   */
  const stationStatusMap =
    execution?.stations.reduce<Record<string, StationExecutionSummary>>(
      (acc, station) => {
        acc[station.station_id] = station;
        return acc;
      },
      {}
    ) || {};

  /**
   * Get the status for a specific station
   * Returns the most recent execution status for the station
   */
  const getStationStatus = (stationId: string): StationExecutionSummary | null => {
    return stationStatusMap[stationId] || null;
  };

  /**
   * Calculate progress (completed stations / total stations)
   */
  const progress = execution
    ? {
        completed: execution.stations.filter((s) => s.status === 'completed').length,
        total: execution.stations.length,
        percentage:
          execution.stations.length > 0
            ? Math.round(
                (execution.stations.filter((s) => s.status === 'completed').length /
                  execution.stations.length) *
                  100
              )
            : 0,
      }
    : null;

  /**
   * Check if workflow is currently running
   */
  const isRunning = execution?.status === 'running';

  /**
   * Check if workflow is completed (success or failure)
   */
  const isCompleted =
    execution?.status === 'completed' ||
    execution?.status === 'failed' ||
    execution?.status === 'cancelled';

  return {
    execution,
    isLoading,
    error,
    refetch,
    stationStatusMap,
    getStationStatus,
    progress,
    isRunning,
    isCompleted,
  };
}
