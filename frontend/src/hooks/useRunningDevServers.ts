import { useState, useEffect, useMemo } from 'react';
import { makeRequest } from '@/lib/api';
import type { ApiResponse, ExecutionProcessSummary } from 'shared/types';

export function useRunningDevServers(projectId: string) {
  const [devServers, setDevServers] = useState<ExecutionProcessSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRunningDevServers = async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/running-dev-servers`
      );

      if (response.ok) {
        const result: ApiResponse<ExecutionProcessSummary[]> =
          await response.json();
        if (result.success && result.data) {
          setDevServers(result.data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch running dev servers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRunningDevServers();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchRunningDevServers, 5000);
    return () => clearInterval(interval);
  }, [projectId]);

  // Group dev servers by task_id
  const devServersByTask = useMemo(() => {
    const map = new Map<string, ExecutionProcessSummary[]>();
    devServers.forEach((server) => {
      if (server.task_id) {
        const existing = map.get(server.task_id) || [];
        map.set(server.task_id, [...existing, server]);
      }
    });
    return map;
  }, [devServers]);

  // Check if any dev servers are running
  const hasRunningDevServers = useMemo(() => {
    return devServers.length > 0;
  }, [devServers]);

  // Function to check if a specific task has running dev servers
  const hasRunningDevServerForTask = (taskId: string): boolean => {
    return devServersByTask.has(taskId);
  };

  return {
    devServers,
    devServersByTask,
    hasRunningDevServers,
    hasRunningDevServerForTask,
    loading,
    refetch: fetchRunningDevServers,
  };
}
