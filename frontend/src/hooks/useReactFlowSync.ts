import { useMemo, useCallback } from 'react';
import type { Node, Edge, NodeChange, EdgeChange } from 'reactflow';
import type {
  WorkflowStation,
  StationTransition,
  UpdateWorkflowStation,
  UpdateStationTransition,
} from 'shared/types';

export interface StationNodeData {
  station: WorkflowStation;
  label: string;
  description?: string | null;
  agentId?: string | null;
  stationPrompt?: string | null;
  outputContextKeys?: string | null;
  stationId: string;
}

export interface TransitionEdgeData {
  label?: string | null;
  condition?: string | null;
  conditionType?: string | null;
  conditionValue?: string | null;
  transitionId: string;
}

// Partial update types for position-only updates
export type StationPositionUpdate = Partial<UpdateWorkflowStation> & {
  x_position?: number;
  y_position?: number;
};

interface UseReactFlowSyncOptions {
  stations: WorkflowStation[];
  transitions: StationTransition[];
  onStationUpdate?: (id: string, data: StationPositionUpdate) => void;
  onTransitionUpdate?: (id: string, data: UpdateStationTransition) => void;
}

export function useReactFlowSync(options: UseReactFlowSyncOptions) {
  const { stations, transitions, onStationUpdate } = options;

  // Convert workflow stations to React Flow nodes
  const nodes = useMemo<Node<StationNodeData>[]>(() => {
    return stations.map((station) => ({
      id: station.id,
      type: 'station',
      position: {
        x: station.x_position,
        y: station.y_position,
      },
      data: {
        station,  // Include full station object for StationNode component
        label: station.name,
        description: station.description,
        agentId: station.agent_id,
        stationPrompt: station.station_prompt,
        outputContextKeys: station.output_context_keys,
        stationId: station.id,
      },
    }));
  }, [stations]);

  // Convert station transitions to React Flow edges
  const edges = useMemo<Edge<TransitionEdgeData>[]>(() => {
    return transitions.map((transition) => ({
      id: transition.id,
      source: transition.source_station_id,
      target: transition.target_station_id,
      type: 'transition',
      animated: transition.condition_type === 'conditional',
      label: transition.label ?? undefined,
      data: {
        label: transition.label,
        condition: transition.condition,
        conditionType: transition.condition_type,
        conditionValue: transition.condition_value,
        transitionId: transition.id,
      },
    }));
  }, [transitions]);

  // Handle node changes (position, selection, etc.)
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!onStationUpdate) return;

      changes.forEach((change) => {
        if (change.type === 'position' && change.position && !change.dragging) {
          // Only update when drag ends
          onStationUpdate(change.id, {
            x_position: change.position.x,
            y_position: change.position.y,
          });
        }
      });
    },
    [onStationUpdate]
  );

  // Handle edge changes (connection, deletion, etc.)
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Edge changes are typically handled through mutations
      // This is here for consistency with React Flow API
      console.log('Edge changes:', changes);
    },
    []
  );

  // Convert React Flow node to station update
  const nodeToStationUpdate = useCallback(
    (node: Node<StationNodeData>): UpdateWorkflowStation => {
      return {
        name: node.data.label,
        position: null, // Position is managed by workflow, not by React Flow
        description: node.data.description ?? null,
        x_position: node.position.x,
        y_position: node.position.y,
        agent_id: node.data.agentId ?? null,
        station_prompt: node.data.stationPrompt ?? null,
        output_context_keys: node.data.outputContextKeys ?? null,
      };
    },
    []
  );

  // Convert React Flow edge to transition update
  const edgeToTransitionUpdate = useCallback(
    (edge: Edge<TransitionEdgeData>): UpdateStationTransition => {
      return {
        label: edge.data?.label ?? null,
        condition: edge.data?.condition ?? null,
        condition_type: edge.data?.conditionType ?? null,
        condition_value: edge.data?.conditionValue ?? null,
      };
    },
    []
  );

  // Batch update node positions (useful after auto-layout)
  const batchUpdateNodePositions = useCallback(
    (nodeUpdates: Array<{ id: string; position: { x: number; y: number } }>) => {
      if (!onStationUpdate) return;

      nodeUpdates.forEach(({ id, position }) => {
        onStationUpdate(id, {
          x_position: position.x,
          y_position: position.y,
        });
      });
    },
    [onStationUpdate]
  );

  // Get station by node ID
  const getStationById = useCallback(
    (nodeId: string): WorkflowStation | undefined => {
      return stations.find((s) => s.id === nodeId);
    },
    [stations]
  );

  // Get transition by edge ID
  const getTransitionById = useCallback(
    (edgeId: string): StationTransition | undefined => {
      return transitions.find((t) => t.id === edgeId);
    },
    [transitions]
  );

  // Validate edge connection
  const isValidConnection = useCallback(
    (connection: { source: string; target: string }): boolean => {
      // Prevent self-loops
      if (connection.source === connection.target) {
        return false;
      }

      // Check if connection already exists
      const exists = transitions.some(
        (t) =>
          t.source_station_id === connection.source &&
          t.target_station_id === connection.target
      );

      return !exists;
    },
    [transitions]
  );

  return {
    // React Flow data
    nodes,
    edges,

    // Event handlers
    onNodesChange,
    onEdgesChange,

    // Conversion utilities
    nodeToStationUpdate,
    edgeToTransitionUpdate,
    batchUpdateNodePositions,

    // Lookup utilities
    getStationById,
    getTransitionById,
    isValidConnection,
  };
}
