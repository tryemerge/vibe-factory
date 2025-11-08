import { useQuery } from '@tanstack/react-query';
import { workflowExecutionsApi } from '@/lib/api';
import type { TaskWithAttemptStatus } from 'shared/types';
import { useMemo } from 'react';

/**
 * Hook to fetch workflow executions for a list of in-progress tasks
 * Returns a map of station IDs to active tasks at each station
 */
export function useWorkflowExecutions(
  _workflowId: string | null,
  inProgressTasks: TaskWithAttemptStatus[]
) {
  // Fetch workflow execution for each in-progress task
  const executionQueries = useQuery({
    queryKey: ['workflow-executions', 'in-progress-tasks', inProgressTasks.map(t => t.id)],
    queryFn: async () => {
      const results = await Promise.all(
        inProgressTasks.map(async (task) => {
          try {
            const execution = await workflowExecutionsApi.getTaskExecution(task.id);
            return { task, execution };
          } catch (error) {
            console.error(`Failed to fetch execution for task ${task.id}:`, error);
            return { task, execution: null };
          }
        })
      );
      return results;
    },
    enabled: inProgressTasks.length > 0,
    refetchInterval: 2000, // Poll every 2 seconds for updates
  });

  // Build station → tasks map
  const stationTasksMap = useMemo(() => {
    const map = new Map<string, Array<{ id: string; title: string }>>();

    if (!executionQueries.data) return map;

    for (const { task, execution } of executionQueries.data) {
      if (execution && execution.current_station_id) {
        const existing = map.get(execution.current_station_id) || [];
        existing.push({
          id: task.id,
          title: task.title,
        });
        map.set(execution.current_station_id, existing);
      }
    }

    return map;
  }, [executionQueries.data]);

  return {
    stationTasksMap,
    executions: executionQueries.data || [],
    isLoading: executionQueries.isLoading,
    error: executionQueries.error,
  };
}
