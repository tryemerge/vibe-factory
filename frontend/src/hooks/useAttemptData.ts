import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useExecutionProcesses } from './useExecutionProcesses';
import { executionProcessesApi } from '@/lib/api';
import type { AttemptData } from '@/lib/types';
import type { ExecutionProcess } from 'shared/types';

export function useAttemptData(attemptId?: string) {
  const {
    data: executionData,
    isLoading: processesLoading,
    isFetching: processesFetching,
  } = useExecutionProcesses(attemptId);

  // Get setup script processes that need detailed info
  const setupProcesses = useMemo(() => {
    if (!executionData?.processes) return [];
    return executionData.processes.filter(
      (p) => p.run_reason === 'setupscript'
    );
  }, [executionData?.processes]);

  // Fetch details for setup processes
  const processDetailQueries = useQueries({
    queries: setupProcesses.map((process) => ({
      queryKey: ['processDetails', process.id],
      queryFn: () => executionProcessesApi.getDetails(process.id),
      enabled: !!process.id,
    })),
  });

  const attemptData: AttemptData = useMemo(() => {
    if (!executionData?.processes) {
      return { processes: [], runningProcessDetails: {} };
    }

    // Build runningProcessDetails from the detail queries
    const runningProcessDetails: Record<string, ExecutionProcess> = {};

    setupProcesses.forEach((process, index) => {
      const detailQuery = processDetailQueries[index];
      if (detailQuery?.data) {
        runningProcessDetails[process.id] = detailQuery.data;
      }
    });

    return {
      processes: executionData.processes,
      runningProcessDetails,
    };
  }, [executionData?.processes, setupProcesses, processDetailQueries]);

  const isLoading =
    processesLoading || processDetailQueries.some((q) => q.isLoading);
  const isFetching =
    processesFetching || processDetailQueries.some((q) => q.isFetching);

  return {
    attemptData,
    isAttemptRunning: executionData?.isAttemptRunning ?? false,
    isLoading,
    isFetching,
  };
}
