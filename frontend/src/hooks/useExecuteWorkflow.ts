import { useState, useCallback } from 'react';
import { workflowExecutionsApi } from '@/lib/api';
import type {
  ExecuteWorkflowRequest,
  ExecuteWorkflowResponse,
} from 'shared/types';

interface UseExecuteWorkflowReturn {
  executeWorkflow: (
    workflowId: string,
    request: ExecuteWorkflowRequest
  ) => Promise<ExecuteWorkflowResponse | null>;
  isExecuting: boolean;
  error: string | null;
  lastExecutionId: string | null;
}

/**
 * Hook for executing workflows
 * Handles starting workflow execution and tracking state
 *
 * Note: Task status updates are handled automatically by the backend
 * when workflow execution starts (via start_attempt() flow)
 */
export function useExecuteWorkflow(): UseExecuteWorkflowReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExecutionId, setLastExecutionId] = useState<string | null>(null);

  const executeWorkflow = useCallback(
    async (
      workflowId: string,
      request: ExecuteWorkflowRequest
    ): Promise<ExecuteWorkflowResponse | null> => {
      setIsExecuting(true);
      setError(null);

      try {
        const response = await workflowExecutionsApi.execute(
          workflowId,
          request
        );
        setLastExecutionId(response.workflow_execution_id);
        return response;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to execute workflow';
        setError(errorMessage);
        console.error('Failed to execute workflow:', err);
        return null;
      } finally {
        setIsExecuting(false);
      }
    },
    []
  );

  return {
    executeWorkflow,
    isExecuting,
    error,
    lastExecutionId,
  };
}
