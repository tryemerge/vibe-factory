/**
 * Example usage of TransitionEdge component in React Flow
 *
 * This file demonstrates how to integrate the TransitionEdge component
 * into a React Flow canvas for workflow visualization.
 */

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Connection,
  addEdge,
  EdgeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TransitionEdge } from './TransitionEdge';
import type { StationTransition, WorkflowStation } from 'shared/types';

// Example workflow stations
const exampleStations: WorkflowStation[] = [
  {
    id: 'station-1',
    workflow_id: 'workflow-1',
    name: 'Code Review',
    position: BigInt(1),
    x_position: 100,
    y_position: 100,
    agent_id: null,
    station_prompt: null,
    output_context_keys: null,
    description: 'Review code changes',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'station-2',
    workflow_id: 'workflow-1',
    name: 'Testing',
    position: BigInt(2),
    x_position: 300,
    y_position: 100,
    agent_id: null,
    station_prompt: null,
    output_context_keys: null,
    description: 'Run automated tests',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'station-3',
    workflow_id: 'workflow-1',
    name: 'Deployment',
    position: BigInt(3),
    x_position: 500,
    y_position: 100,
    agent_id: null,
    station_prompt: null,
    output_context_keys: null,
    description: 'Deploy to production',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'station-4',
    workflow_id: 'workflow-1',
    name: 'Fix Issues',
    position: BigInt(0), // Position 0 - creates loopback when pointing back
    x_position: 100,
    y_position: 300,
    agent_id: null,
    station_prompt: null,
    output_context_keys: null,
    description: 'Fix failed tests',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Example transitions
const exampleTransitions: StationTransition[] = [
  {
    id: 'transition-1',
    workflow_id: 'workflow-1',
    source_station_id: 'station-1',
    target_station_id: 'station-2',
    condition: 'on_approval',
    label: 'Approved',
    condition_type: 'on_approval',
    condition_value: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'transition-2',
    workflow_id: 'workflow-1',
    source_station_id: 'station-2',
    target_station_id: 'station-3',
    condition: 'on_tests_pass',
    label: 'Tests Pass',
    condition_type: 'on_tests_pass',
    condition_value: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'transition-3',
    workflow_id: 'workflow-1',
    source_station_id: 'station-2',
    target_station_id: 'station-4',
    condition: 'on_tests_fail',
    label: 'Tests Fail',
    condition_type: 'on_tests_fail',
    condition_value: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'transition-4',
    workflow_id: 'workflow-1',
    source_station_id: 'station-4',
    target_station_id: 'station-1',
    condition: 'on_approval',
    label: 'Fixed - Back to Review',
    condition_type: 'on_approval',
    condition_value: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'transition-5',
    workflow_id: 'workflow-1',
    source_station_id: 'station-3',
    target_station_id: 'station-4',
    condition: 'on_failure',
    label: 'Deploy Failed',
    condition_type: 'on_failure',
    condition_value: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export function TransitionEdgeExample() {
  // Convert stations to React Flow nodes
  const initialNodes: Node[] = useMemo(
    () =>
      exampleStations.map((station) => ({
        id: station.id,
        type: 'default',
        data: { label: station.name },
        position: { x: station.x_position, y: station.y_position },
      })),
    []
  );

  // Create a map of station IDs to positions for loopback detection
  const stationPositionMap = useMemo(() => {
    const map = new Map<string, number>();
    exampleStations.forEach((station) => {
      map.set(station.id, Number(station.position));
    });
    return map;
  }, []);

  // Convert transitions to React Flow edges
  const initialEdges: Edge[] = useMemo(
    () =>
      exampleTransitions.map((transition) => ({
        id: transition.id,
        source: transition.source_station_id,
        target: transition.target_station_id,
        type: 'transition', // Custom edge type
        data: {
          transition,
          sourcePosition: stationPositionMap.get(transition.source_station_id),
          targetPosition: stationPositionMap.get(transition.target_station_id),
          onEdit: (t: StationTransition) => {
            console.log('Edit transition:', t);
            // In a real app, this would open an edit dialog
            alert(`Edit transition: ${t.label || t.condition_type}`);
          },
        },
      })),
    [stationPositionMap]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Register custom edge types
  const edgeTypes: EdgeTypes = useMemo(
    () => ({
      transition: TransitionEdge,
    }),
    []
  );

  return (
    <div className="w-full h-screen">
      <div className="p-4 border-b bg-card">
        <h1 className="text-2xl font-bold">Workflow Visualization Example</h1>
        <p className="text-sm text-muted-foreground">
          Demonstrating TransitionEdge with different condition types and
          loopback
        </p>
      </div>
      <div className="w-full h-[calc(100vh-5rem)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </div>
      <div className="fixed bottom-4 right-4 bg-card border rounded-lg p-4 shadow-lg max-w-xs">
        <h3 className="font-semibold mb-2">Edge Color Legend</h3>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-green-500"></div>
            <span>On Approval</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-red-500"></div>
            <span>On Failure</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-blue-500"></div>
            <span>On Tests Pass</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-yellow-500"></div>
            <span>On Tests Fail</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-gray-500"></div>
            <span>Default/No Condition</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground">
            🔁 indicates a loopback edge (target position &lt; source position)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Click edge labels to edit conditions
          </p>
        </div>
      </div>
    </div>
  );
}
