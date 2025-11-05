import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stationTransitionsApi } from '@/lib/api';
import type {
  StationTransition,
  CreateStationTransition,
  UpdateStationTransition,
} from 'shared/types';
import { useCallback, useEffect, useRef } from 'react';

interface UseWorkflowTransitionsOptions {
  workflowId?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  onSaveSuccess?: (transition: StationTransition) => void;
  onSaveError?: (error: unknown) => void;
}

export function useWorkflowTransitions(
  options: UseWorkflowTransitionsOptions = {}
) {
  const {
    workflowId,
    autoSave = false,
    autoSaveDelay = 1000,
    onSaveSuccess,
    onSaveError,
  } = options;

  const queryClient = useQueryClient();
  const saveTimeoutRef = useRef<number | null>(null);

  // Query for transitions by workflow
  const transitionsQuery = useQuery({
    queryKey: ['station-transitions', workflowId],
    queryFn: () => stationTransitionsApi.getByWorkflowId(workflowId!),
    enabled: !!workflowId,
  });

  // Create transition mutation
  const createTransition = useMutation({
    mutationFn: ({
      workflowId,
      data,
    }: {
      workflowId: string;
      data: CreateStationTransition;
    }) => stationTransitionsApi.create(workflowId, data),
    onSuccess: (transition: StationTransition) => {
      // Update transitions list in cache
      queryClient.setQueryData<StationTransition[]>(
        ['station-transitions', transition.workflow_id],
        (old) => (old ? [...old, transition] : [transition])
      );
      onSaveSuccess?.(transition);
    },
    onError: (error) => {
      console.error('Failed to create transition:', error);
      onSaveError?.(error);
    },
  });

  // Update transition mutation
  const updateTransition = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateStationTransition;
    }) => stationTransitionsApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['station-transitions', workflowId],
      });

      // Snapshot previous value
      const previousTransitions = queryClient.getQueryData<
        StationTransition[]
      >(['station-transitions', workflowId]);

      // Optimistically update
      if (previousTransitions) {
        queryClient.setQueryData<StationTransition[]>(
          ['station-transitions', workflowId],
          previousTransitions.map((transition) =>
            transition.id === id
              ? {
                  ...transition,
                  ...data,
                  condition:
                    data.condition !== undefined
                      ? data.condition
                      : transition.condition,
                  label:
                    data.label !== undefined ? data.label : transition.label,
                  condition_type:
                    data.condition_type !== undefined
                      ? data.condition_type
                      : transition.condition_type,
                  condition_value:
                    data.condition_value !== undefined
                      ? data.condition_value
                      : transition.condition_value,
                }
              : transition
          )
        );
      }

      return { previousTransitions };
    },
    onSuccess: (transition: StationTransition) => {
      // Update transitions list in cache
      queryClient.setQueryData<StationTransition[]>(
        ['station-transitions', transition.workflow_id],
        (old) =>
          old
            ? old.map((t) => (t.id === transition.id ? transition : t))
            : [transition]
      );
      onSaveSuccess?.(transition);
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousTransitions) {
        queryClient.setQueryData(
          ['station-transitions', workflowId],
          context.previousTransitions
        );
      }
      console.error('Failed to update transition:', error);
      onSaveError?.(error);
    },
  });

  // Delete transition mutation
  const deleteTransition = useMutation({
    mutationFn: (id: string) => stationTransitionsApi.delete(id),
    onMutate: async (id: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['station-transitions', workflowId],
      });

      // Snapshot previous value
      const previousTransitions = queryClient.getQueryData<
        StationTransition[]
      >(['station-transitions', workflowId]);

      // Optimistically update
      if (previousTransitions) {
        queryClient.setQueryData<StationTransition[]>(
          ['station-transitions', workflowId],
          previousTransitions.filter((transition) => transition.id !== id)
        );
      }

      return { previousTransitions };
    },
    onError: (error, _id, context) => {
      // Rollback on error
      if (context?.previousTransitions) {
        queryClient.setQueryData(
          ['station-transitions', workflowId],
          context.previousTransitions
        );
      }
      console.error('Failed to delete transition:', error);
    },
  });

  // Debounced save function for auto-save
  const debouncedSave = useCallback(
    (id: string, data: UpdateStationTransition) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        updateTransition.mutate({ id, data });
      }, autoSaveDelay);
    },
    [autoSaveDelay, updateTransition]
  );

  // Save function that respects auto-save setting
  const saveTransition = useCallback(
    (id: string, data: UpdateStationTransition, immediate = false) => {
      if (immediate || !autoSave) {
        updateTransition.mutate({ id, data });
      } else {
        debouncedSave(id, data);
      }
    },
    [autoSave, debouncedSave, updateTransition]
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
    transitions: transitionsQuery.data ?? [],

    // Loading states
    isLoading: transitionsQuery.isLoading,
    isSaving:
      createTransition.isPending ||
      updateTransition.isPending ||
      deleteTransition.isPending,

    // Error states
    error: transitionsQuery.error,

    // Mutations
    createTransition: createTransition.mutate,
    saveTransition,
    updateTransition: updateTransition.mutate,
    deleteTransition: deleteTransition.mutate,

    // Mutation states
    createMutation: createTransition,
    updateMutation: updateTransition,
    deleteMutation: deleteTransition,

    // Refetch
    refetch: transitionsQuery.refetch,
  };
}
