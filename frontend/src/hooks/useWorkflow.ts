import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowsApi } from '@/lib/api';
import type {
  Workflow,
  CreateWorkflow,
  UpdateWorkflow,
} from 'shared/types';
import { useCallback, useEffect, useRef } from 'react';

interface UseWorkflowOptions {
  workflowId?: string;
  projectId?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  onSaveSuccess?: (workflow: Workflow) => void;
  onSaveError?: (error: unknown) => void;
}

export function useWorkflow(options: UseWorkflowOptions = {}) {
  const {
    workflowId,
    projectId,
    autoSave = false,
    autoSaveDelay = 1000,
    onSaveSuccess,
    onSaveError,
  } = options;

  const queryClient = useQueryClient();
  const saveTimeoutRef = useRef<number | null>(null);

  // Query for single workflow
  const workflowQuery = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => workflowsApi.getById(workflowId!),
    enabled: !!workflowId,
  });

  // Query for workflows by project
  const projectWorkflowsQuery = useQuery({
    queryKey: ['workflows', 'project', projectId],
    queryFn: () => workflowsApi.getByProjectId(projectId!),
    enabled: !!projectId,
  });

  // Create workflow mutation
  const createWorkflow = useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: CreateWorkflow;
    }) => workflowsApi.create(projectId, data),
    onSuccess: (workflow: Workflow) => {
      queryClient.setQueryData(['workflow', workflow.id], workflow);
      queryClient.invalidateQueries({
        queryKey: ['workflows', 'project', workflow.project_id],
      });
      onSaveSuccess?.(workflow);
    },
    onError: (error) => {
      console.error('Failed to create workflow:', error);
      onSaveError?.(error);
    },
  });

  // Update workflow mutation
  const updateWorkflow = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWorkflow }) =>
      workflowsApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['workflow', id] });

      // Snapshot previous value
      const previousWorkflow = queryClient.getQueryData<Workflow>([
        'workflow',
        id,
      ]);

      // Optimistically update
      if (previousWorkflow) {
        queryClient.setQueryData<Workflow>(['workflow', id], {
          ...previousWorkflow,
          ...data,
          name: data.name ?? previousWorkflow.name,
          description:
            data.description !== undefined
              ? data.description
              : previousWorkflow.description,
        });
      }

      return { previousWorkflow };
    },
    onSuccess: (workflow: Workflow) => {
      queryClient.setQueryData(['workflow', workflow.id], workflow);
      queryClient.invalidateQueries({
        queryKey: ['workflows', 'project', workflow.project_id],
      });
      onSaveSuccess?.(workflow);
    },
    onError: (error, { id }, context) => {
      // Rollback on error
      if (context?.previousWorkflow) {
        queryClient.setQueryData(['workflow', id], context.previousWorkflow);
      }
      console.error('Failed to update workflow:', error);
      onSaveError?.(error);
    },
  });

  // Delete workflow mutation
  const deleteWorkflow = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(id),
    onSuccess: (_: void, id: string) => {
      const workflow = queryClient.getQueryData<Workflow>(['workflow', id]);
      if (workflow) {
        queryClient.invalidateQueries({
          queryKey: ['workflows', 'project', workflow.project_id],
        });
      }
      queryClient.removeQueries({ queryKey: ['workflow', id], exact: true });
    },
    onError: (error) => {
      console.error('Failed to delete workflow:', error);
    },
  });

  // Debounced save function for auto-save
  const debouncedSave = useCallback(
    (id: string, data: UpdateWorkflow) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        updateWorkflow.mutate({ id, data });
      }, autoSaveDelay);
    },
    [autoSaveDelay, updateWorkflow]
  );

  // Save function that respects auto-save setting
  const saveWorkflow = useCallback(
    (id: string, data: UpdateWorkflow, immediate = false) => {
      if (immediate || !autoSave) {
        updateWorkflow.mutate({ id, data });
      } else {
        debouncedSave(id, data);
      }
    },
    [autoSave, debouncedSave, updateWorkflow]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Data
    workflow: workflowQuery.data,
    workflows: projectWorkflowsQuery.data,

    // Loading states
    isLoading: workflowQuery.isLoading || projectWorkflowsQuery.isLoading,
    isSaving:
      createWorkflow.isPending ||
      updateWorkflow.isPending ||
      deleteWorkflow.isPending,

    // Error states
    error: workflowQuery.error || projectWorkflowsQuery.error,

    // Mutations
    createWorkflow: createWorkflow.mutate,
    saveWorkflow,
    updateWorkflow: updateWorkflow.mutate,
    deleteWorkflow: deleteWorkflow.mutate,

    // Mutation states
    createMutation: createWorkflow,
    updateMutation: updateWorkflow,
    deleteMutation: deleteWorkflow,

    // Refetch
    refetch: workflowQuery.refetch,
    refetchWorkflows: projectWorkflowsQuery.refetch,
  };
}
