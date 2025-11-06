import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  StationNode,
  StationNodeData,
  StationStatus,
} from '@/components/factory/StationNode';
import type { WorkflowStation, Agent } from 'shared/types';

// Mock data for demo purposes
const mockAgent: Agent = {
  id: '1',
  name: 'Code Agent',
  role: 'Developer',
  system_prompt: 'You are a helpful coding assistant',
  capabilities: null,
  tools: null,
  description: 'Handles code implementation',
  context_files: null,
  executor: 'CLAUDE_CODE',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockStation1: WorkflowStation = {
  id: 'station-1',
  workflow_id: 'workflow-1',
  name: 'Design Station',
  position: BigInt(0),
  description: 'Create UI/UX designs and mockups',
  x_position: 250,
  y_position: 50,
  agent_id: mockAgent.id,
  station_prompt: 'Create high-level design and wireframes for the feature',
  output_context_keys: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockStation2: WorkflowStation = {
  id: 'station-2',
  workflow_id: 'workflow-1',
  name: 'Implementation',
  position: BigInt(1),
  description: 'Write code based on designs',
  x_position: 250,
  y_position: 200,
  agent_id: mockAgent.id,
  station_prompt: 'Implement the feature according to design specifications',
  output_context_keys: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockStation3: WorkflowStation = {
  id: 'station-3',
  workflow_id: 'workflow-1',
  name: 'Testing',
  position: BigInt(2),
  description: 'Run tests and verify functionality',
  x_position: 250,
  y_position: 350,
  agent_id: null,
  station_prompt: 'Write and execute comprehensive test suite',
  output_context_keys: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockStation4: WorkflowStation = {
  id: 'station-4',
  workflow_id: 'workflow-1',
  name: 'Deployment',
  position: BigInt(3),
  description: 'Deploy to production environment',
  x_position: 250,
  y_position: 500,
  agent_id: mockAgent.id,
  station_prompt: 'Deploy the feature to production with proper monitoring',
  output_context_keys: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const initialNodes: Node<StationNodeData>[] = [
  {
    id: 'station-1',
    type: 'station',
    data: {
      station: mockStation1,
      agent: mockAgent,
      status: 'completed' as StationStatus,
    },
    position: { x: mockStation1.x_position, y: mockStation1.y_position },
  },
  {
    id: 'station-2',
    type: 'station',
    data: {
      station: mockStation2,
      agent: mockAgent,
      status: 'running' as StationStatus,
    },
    position: { x: mockStation2.x_position, y: mockStation2.y_position },
  },
  {
    id: 'station-3',
    type: 'station',
    data: {
      station: mockStation3,
      agent: null,
      status: 'idle' as StationStatus,
    },
    position: { x: mockStation3.x_position, y: mockStation3.y_position },
  },
  {
    id: 'station-4',
    type: 'station',
    data: {
      station: mockStation4,
      agent: mockAgent,
      status: 'failed' as StationStatus,
    },
    position: { x: mockStation4.x_position, y: mockStation4.y_position },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e1-2',
    source: 'station-1',
    target: 'station-2',
    animated: true,
    style: { stroke: '#10b981' },
  },
  {
    id: 'e2-3',
    source: 'station-2',
    target: 'station-3',
    animated: true,
    style: { stroke: '#3b82f6' },
  },
  {
    id: 'e3-4',
    source: 'station-3',
    target: 'station-4',
    style: { stroke: '#9ca3af' },
  },
];

export function StationDemoPage() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      station: StationNode,
    }),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="flex flex-col h-screen w-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div>
          <h1 className="text-2xl font-bold">Station Node Demo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Demonstration of custom station nodes with different statuses
          </p>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          panOnScroll
          zoomOnScroll
          fitView
        >
          <Controls />
          <MiniMap />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="absolute bottom-20 left-4 bg-card border rounded-lg p-4 shadow-lg">
        <h3 className="font-semibold mb-2 text-sm">Status Legend</h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-gray-500" />
            <span>Idle - No activity</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-blue-500" />
            <span>Running - In progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <span>Completed - Success</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <span>Failed - Error occurred</span>
          </div>
        </div>
      </div>
    </div>
  );
}
