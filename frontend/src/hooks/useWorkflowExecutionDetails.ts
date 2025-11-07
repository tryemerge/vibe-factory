import { useEffect, useState, useCallback } from 'react';
import { workflowExecutionsApi } from '@/lib/api';
import type {
  WorkflowExecutionDetailsResponse,
  StationExecutionSummary,
} from 'shared/types';

interface UseWorkflowExecutionDetailsResult {
  execution: WorkflowExecutionDetailsResponse | null;
  stations: StationExecutionSummary[];
  currentStation: StationExecutionSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and monitor workflow execution progress for detail panel
 *
 * ⚠️ NOTE: This is different from useWorkflowExecution (from PR #38)
 * - useWorkflowExecution: Factory Floor monitoring hook (React Query based)
 * - useWorkflowExecutionDetails: Detail panel hook (useState/useEffect based)
 *
 * Polls for updates every 2 seconds when workflow is running
 */
export const useWorkflowExecutionDetails = (
  executionId: string | undefined
): UseWorkflowExecutionDetailsResult => {
  const [execution, setExecution] =
    useState<WorkflowExecutionDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExecution = useCallback(async () => {
    if (!executionId) {
      setIsLoading(false);
      return;
    }

    try {
      const data = await workflowExecutionsApi.getById(executionId);
      setExecution(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch workflow execution:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch workflow execution'
      );
    } finally {
      setIsLoading(false);
    }
  }, [executionId]);

  // Initial fetch
  useEffect(() => {
    fetchExecution();
  }, [fetchExecution]);

  // Poll for updates when workflow is running
  useEffect(() => {
    if (!execution || execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
      return;
    }

    const pollInterval = setInterval(() => {
      fetchExecution();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [execution, fetchExecution]);

  const stations = execution?.stations ?? [];
  const currentStation = execution?.current_station_id
    ? stations.find((s) => s.station_id === execution.current_station_id) ?? null
    : null;

  return {
    execution,
    stations,
    currentStation,
    isLoading,
    error,
    refetch: fetchExecution,
  };
};
