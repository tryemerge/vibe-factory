import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowStationsApi } from '@/lib/api';
import type {
  WorkflowStation,
  CreateWorkflowStation,
  UpdateWorkflowStation,
} from 'shared/types';
import { useCallback, useEffect, useRef } from 'react';

interface UseWorkflowStationsOptions {
  workflowId?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  onSaveSuccess?: (station: WorkflowStation) => void;
  onSaveError?: (error: unknown) => void;
}

export function useWorkflowStations(options: UseWorkflowStationsOptions = {}) {
  const {
    workflowId,
    autoSave = false,
    autoSaveDelay = 1000,
    onSaveSuccess,
    onSaveError,
  } = options;

  const queryClient = useQueryClient();
  const saveTimeoutRef = useRef<number | null>(null);

  // Query for stations by workflow
  const stationsQuery = useQuery({
    queryKey: ['workflow-stations', workflowId],
    queryFn: () => workflowStationsApi.getByWorkflowId(workflowId!),
    enabled: !!workflowId,
  });

  // Create station mutation
  const createStation = useMutation({
    mutationFn: ({
      workflowId,
      data,
    }: {
      workflowId: string;
      data: CreateWorkflowStation;
    }) => workflowStationsApi.create(workflowId, data),
    onSuccess: (station: WorkflowStation) => {
      // Update stations list in cache
      queryClient.setQueryData<WorkflowStation[]>(
        ['workflow-stations', station.workflow_id],
        (old) => (old ? [...old, station] : [station])
      );
      onSaveSuccess?.(station);
    },
    onError: (error) => {
      console.error('Failed to create station:', error);
      onSaveError?.(error);
    },
  });

  // Update station mutation
  const updateStation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWorkflowStation }) =>
      workflowStationsApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['workflow-stations', workflowId],
      });

      // Snapshot previous value
      const previousStations = queryClient.getQueryData<WorkflowStation[]>([
        'workflow-stations',
        workflowId,
      ]);

      // Optimistically update
      if (previousStations) {
        queryClient.setQueryData<WorkflowStation[]>(
          ['workflow-stations', workflowId],
          previousStations.map((station) =>
            station.id === id
              ? {
                  ...station,
                  ...data,
                  name: data.name ?? station.name,
                  position: data.position ?? station.position,
                  description:
                    data.description !== undefined
                      ? data.description
                      : station.description,
                  x_position: data.x_position ?? station.x_position,
                  y_position: data.y_position ?? station.y_position,
                  agent_id:
                    data.agent_id !== undefined
                      ? data.agent_id
                      : station.agent_id,
                  station_prompt:
                    data.station_prompt !== undefined
                      ? data.station_prompt
                      : station.station_prompt,
                  output_context_keys:
                    data.output_context_keys !== undefined
                      ? data.output_context_keys
                      : station.output_context_keys,
                }
              : station
          )
        );
      }

      return { previousStations };
    },
    onSuccess: (station: WorkflowStation) => {
      // Update stations list in cache
      queryClient.setQueryData<WorkflowStation[]>(
        ['workflow-stations', station.workflow_id],
        (old) =>
          old ? old.map((s) => (s.id === station.id ? station : s)) : [station]
      );
      onSaveSuccess?.(station);
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousStations) {
        queryClient.setQueryData(
          ['workflow-stations', workflowId],
          context.previousStations
        );
      }
      console.error('Failed to update station:', error);
      onSaveError?.(error);
    },
  });

  // Delete station mutation
  const deleteStation = useMutation({
    mutationFn: (id: string) => workflowStationsApi.delete(id),
    onMutate: async (id: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: ['workflow-stations', workflowId],
      });

      // Snapshot previous value
      const previousStations = queryClient.getQueryData<WorkflowStation[]>([
        'workflow-stations',
        workflowId,
      ]);

      // Optimistically update
      if (previousStations) {
        queryClient.setQueryData<WorkflowStation[]>(
          ['workflow-stations', workflowId],
          previousStations.filter((station) => station.id !== id)
        );
      }

      return { previousStations };
    },
    onError: (error, _id, context) => {
      // Rollback on error
      if (context?.previousStations) {
        queryClient.setQueryData(
          ['workflow-stations', workflowId],
          context.previousStations
        );
      }
      console.error('Failed to delete station:', error);
    },
  });

  // Debounced save function for auto-save
  const debouncedSave = useCallback(
    (id: string, data: UpdateWorkflowStation) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        updateStation.mutate({ id, data });
      }, autoSaveDelay);
    },
    [autoSaveDelay, updateStation]
  );

  // Save function that respects auto-save setting
  const saveStation = useCallback(
    (id: string, data: UpdateWorkflowStation, immediate = false) => {
      if (immediate || !autoSave) {
        updateStation.mutate({ id, data });
      } else {
        debouncedSave(id, data);
      }
    },
    [autoSave, debouncedSave, updateStation]
  );

  // Batch update stations (for position updates after drag/drop)
  const batchUpdateStations = useCallback(
    (updates: Array<{ id: string; data: UpdateWorkflowStation }>) => {
      // Optimistically update all stations
      const previousStations = queryClient.getQueryData<WorkflowStation[]>([
        'workflow-stations',
        workflowId,
      ]);

      if (previousStations) {
        const updateMap = new Map(updates.map((u) => [u.id, u.data]));
        queryClient.setQueryData<WorkflowStation[]>(
          ['workflow-stations', workflowId],
          previousStations.map((station) => {
            const update = updateMap.get(station.id);
            if (!update) return station;

            // Only update position fields for batch updates
            return {
              ...station,
              x_position: update.x_position ?? station.x_position,
              y_position: update.y_position ?? station.y_position,
              position: update.position ?? station.position,
            };
          })
        );
      }

      // Execute all updates
      Promise.all(
        updates.map(({ id, data }) => workflowStationsApi.update(id, data))
      )
        .then(() => {
          queryClient.invalidateQueries({
            queryKey: ['workflow-stations', workflowId],
          });
        })
        .catch((error) => {
          // Rollback on error
          if (previousStations) {
            queryClient.setQueryData(
              ['workflow-stations', workflowId],
              previousStations
            );
          }
          console.error('Failed to batch update stations:', error);
          onSaveError?.(error);
        });
    },
    [workflowId, queryClient, onSaveError]
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
    stations: stationsQuery.data ?? [],

    // Loading states
    isLoading: stationsQuery.isLoading,
    isSaving:
      createStation.isPending ||
      updateStation.isPending ||
      deleteStation.isPending,

    // Error states
    error: stationsQuery.error,

    // Mutations
    createStation: createStation.mutate,
    saveStation,
    updateStation: updateStation.mutate,
    deleteStation: deleteStation.mutate,
    batchUpdateStations,

    // Mutation states
    createMutation: createStation,
    updateMutation: updateStation,
    deleteMutation: deleteStation,

    // Refetch
    refetch: stationsQuery.refetch,
  };
}
