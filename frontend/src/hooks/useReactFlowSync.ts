import { useMemo, useCallback, useState, useEffect } from 'react';
import type { Node, Edge, NodeChange, EdgeChange, NodeDragHandler } from 'reactflow';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type {
  WorkflowStation,
  StationTransition,
  UpdateWorkflowStation,
  UpdateStationTransition,
} from 'shared/types';
import type { StationExecutionSummary } from '@/types/workflow-execution';
import type { StationStatus } from '@/components/factory/StationNode';

export interface StationNodeData {
  station: WorkflowStation;
  label: string;
  description?: string | null;
  agentId?: string | null;
  stationPrompt?: string | null;
  outputContextKeys?: string | null;
  stationId: string;
  status?: StationStatus;
  activeTasks?: Array<{
    id: string;
    title: string;
  }>;
  onEdit?: (stationId: string) => void;
  onDelete?: (stationId: string) => void;
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
  stationStatusMap?: Record<string, StationExecutionSummary>;
  stationTasksMap?: Map<string, Array<{ id: string; title: string }>>;
  onStationUpdate?: (id: string, data: StationPositionUpdate) => void;
  onTransitionUpdate?: (id: string, data: UpdateStationTransition) => void;
  onStationEdit?: (stationId: string) => void;
  onStationDelete?: (stationId: string) => void;
  onTransitionEdit?: (transition: StationTransition) => void;
  onTransitionDelete?: (transitionId: string) => void;
}

/**
 * Map backend station execution status to frontend StationStatus enum
 */
function mapExecutionStatus(
  backendStatus: string | undefined
): StationStatus | undefined {
  if (!backendStatus) return undefined;

  // Backend statuses: 'pending', 'running', 'completed', 'failed', 'skipped'
  // Frontend statuses: 'idle', 'pending', 'running', 'completed', 'failed'
  switch (backendStatus.toLowerCase()) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'completed'; // Treat skipped as completed for display
    default:
      return 'idle';
  }
}

export function useReactFlowSync(options: UseReactFlowSyncOptions) {
  const { stations, transitions, stationStatusMap, stationTasksMap, onStationUpdate, onStationEdit, onStationDelete, onTransitionEdit, onTransitionDelete } = options;

  // Memoize station structure separately (stable - only changes when stations are added/removed/renamed)
  const stationStructure = useMemo(() =>
    stations.map(s => ({
      id: s.id,
      name: s.name,
      position: { x: s.x_position, y: s.y_position },
      description: s.description,
      agentId: s.agent_id,
      stationPrompt: s.station_prompt,
      outputContextKeys: s.output_context_keys,
    })),
    [stations]
  );

  // Convert workflow stations to React Flow nodes format
  // Only recalculates when structure changes OR execution data changes meaningfully
  // Note: Callbacks (onStationEdit, onStationDelete) are NOT in dependencies because they're
  // just passed through as data, not executed during memoization
  const derivedNodes = useMemo<Node<StationNodeData>[]>(() => {
    return stationStructure.map((stationData, idx) => {
      const fullStation = stations[idx]; // Get full object for StationNode

      // Get execution status for this station (if running)
      const stationExecution = stationStatusMap?.[stationData.id];
      const status = stationExecution
        ? mapExecutionStatus(stationExecution.status)
        : 'idle';

      // Get active tasks for this station
      const activeTasks = stationTasksMap?.get(stationData.id) || [];

      return {
        id: stationData.id,
        type: 'station',
        position: stationData.position,
        data: {
          station: fullStation,
          label: stationData.name,
          description: stationData.description,
          agentId: stationData.agentId,
          stationPrompt: stationData.stationPrompt,
          outputContextKeys: stationData.outputContextKeys,
          stationId: stationData.id,
          status,
          activeTasks,
          onEdit: onStationEdit,
          onDelete: onStationDelete,
        },
      };
    });
  }, [stationStructure, stations, stationStatusMap, stationTasksMap]);

  // Convert station transitions to React Flow edges format
  // Note: onTransitionEdit callback is NOT in dependencies because it's
  // just passed through as data, not executed during memoization
  const derivedEdges = useMemo<Edge<any>[]>(() => {
    return transitions.map((transition) => {
      // Get source and target positions for loopback detection
      const sourceIdx = stations.findIndex(s => s.id === transition.source_station_id);
      const targetIdx = stations.findIndex(s => s.id === transition.target_station_id);

      return {
        id: transition.id,
        source: transition.source_station_id,
        target: transition.target_station_id,
        type: 'transition',
        animated: transition.condition_type === 'conditional',
        label: transition.label ?? undefined,
        data: {
          transition,
          sourcePosition: sourceIdx,
          targetPosition: targetIdx,
          onEdit: onTransitionEdit,
        },
      };
    });
  }, [transitions, stations]);

  // Local state for React Flow (enables dragging)
  const [nodes, setNodes] = useState<Node<StationNodeData>[]>(derivedNodes);
  const [edges, setEdges] = useState<Edge<TransitionEdgeData>[]>(derivedEdges);
  const [isDragging, setIsDragging] = useState(false);

  // Sync local state with server data when stations/transitions change
  // Skip updates during active drag to prevent position resets
  useEffect(() => {
    if (isDragging) return;

    setNodes((currentNodes) => {
      // Create a map of current node positions (preserve local drag state)
      const currentPositions = new Map(
        currentNodes.map((node) => [node.id, node.position])
      );

      // Update nodes, preserving local positions for existing nodes
      return derivedNodes.map((derivedNode) => {
        const currentPosition = currentPositions.get(derivedNode.id);

        // If node already exists locally, keep its position
        // This preserves dragging state and prevents position resets
        if (currentPosition) {
          return {
            ...derivedNode,
            position: currentPosition,
          };
        }

        // New node - use position from backend
        return derivedNode;
      });
    });
  }, [derivedNodes, isDragging]);

  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges]);

  // Handle node changes (position, selection, etc.)
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Apply changes to local state immediately (enables dragging)
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  // Handle drag start - prevent sync updates during drag
  const onNodeDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  // Handle drag end - persist final positions to backend
  const onNodeDragStop: NodeDragHandler = useCallback(
    (_event, node) => {
      setIsDragging(false);
      if (onStationUpdate) {
        onStationUpdate(node.id, {
          x_position: node.position.x,
          y_position: node.position.y,
        });
      }
    },
    [onStationUpdate]
  );

  // Handle edge changes (connection, deletion, etc.)
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Handle edge removals (delete transitions in backend)
      changes.forEach((change) => {
        if (change.type === 'remove' && onTransitionDelete) {
          onTransitionDelete(change.id);
        }
      });

      // Apply changes to local state immediately
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [onTransitionDelete]
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
        is_terminator: null, // Phase 3.6: Not changed by position updates
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
    onNodeDragStart,
    onNodeDragStop,

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
