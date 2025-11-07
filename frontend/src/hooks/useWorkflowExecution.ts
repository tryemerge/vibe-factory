import { useState, useCallback } from 'react';
import { workflowExecutionsApi } from '@/lib/api';
import type { ExecuteWorkflowRequest, ExecuteWorkflowResponse } from 'shared/types';

interface UseWorkflowExecutionReturn {
  executeWorkflow: (
    workflowId: string,
    request: ExecuteWorkflowRequest
  ) => Promise<ExecuteWorkflowResponse | null>;
  isExecuting: boolean;
  error: string | null;
}

/**
 * Hook for managing workflow execution
 * Handles starting workflow execution and tracking state
 */
export function useWorkflowExecution(): UseWorkflowExecutionReturn {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeWorkflow = useCallback(
    async (
      workflowId: string,
      request: ExecuteWorkflowRequest
    ): Promise<ExecuteWorkflowResponse | null> => {
      setIsExecuting(true);
      setError(null);

      try {
        const response = await workflowExecutionsApi.execute(workflowId, request);
        return response;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to execute workflow';
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
  };
}
