import { useCallback, useMemo, useState, useEffect } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useProject } from '@/contexts/project-context';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import type { TaskWithAttemptStatus, WorkflowStation, StationTransition, Agent } from 'shared/types';
import { TaskTrayCard } from '@/components/factory/TaskTrayCard';
import { ProjectViewNav } from '@/components/projects/ProjectViewNav';
import { WorkflowToolbar } from '@/components/factory/WorkflowToolbar';
import { AgentPalette } from '@/components/factory/AgentPalette';
import { StationConfigPanel } from '@/components/factory/StationConfigPanel';
import { TransitionConfigDialog } from '@/components/factory/TransitionConfigDialog';
import { StationNode, StationNodeData } from '@/components/factory/StationNode';
import { TransitionEdge, TransitionEdgeData } from '@/components/factory/TransitionEdge';
import { agentsApi } from '@/lib/api';

type Task = TaskWithAttemptStatus;

// Define custom node and edge types
const nodeTypes: NodeTypes = {
  station: StationNode,
};

const edgeTypes: EdgeTypes = {
  transition: TransitionEdge,
};

// Helper function to detect loopbacks
function isLoopback(transition: StationTransition): boolean {
  return transition.source_station_id === transition.target_station_id;
}

// Validation function for workflow
function validateWorkflow(
  stations: WorkflowStation[],
  transitions: StationTransition[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check that all stations have agents assigned
  stations.forEach((station) => {
    if (!station.agent_id) {
      errors.push(`Station "${station.name}" has no agent assigned`);
    }
  });

  // Check for orphaned stations (no incoming or outgoing connections)
  if (stations.length > 1) {
    stations.forEach((station) => {
      const hasIncoming = transitions.some(
        (t) => t.target_station_id === station.id
      );
      const hasOutgoing = transitions.some(
        (t) => t.source_station_id === station.id
      );

      if (!hasIncoming && !hasOutgoing) {
        errors.push(`Station "${station.name}" is not connected to the workflow`);
      }
    });
  }

  // Warn about multiple loopbacks
  const loopbacks = transitions.filter(isLoopback);
  if (loopbacks.length > 0) {
    errors.push(`${loopbacks.length} loopback transition(s) detected`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function FactoryFloorPage() {
  const {
    projectId,
    isLoading: projectLoading,
    error: projectError,
  } = useProject();
  const { tasks, isLoading: tasksLoading } = useProjectTasks(projectId || '');

  // Agents state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  // Workflow state (mocked for now since backend isn't ready)
  const [stations, setStations] = useState<WorkflowStation[]>([]);
  const [transitions, setTransitions] = useState<StationTransition[]>([]);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<StationNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TransitionEdgeData>([]);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);

  // UI state
  const [selectedStation, setSelectedStation] = useState<WorkflowStation | null>(
    null
  );
  const [selectedTransition, setSelectedTransition] =
    useState<StationTransition | null>(null);
  const [showTransitionDialog, setShowTransitionDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Undo/Redo state (simplified for demo)
  const [canUndo] = useState(false);
  const [canRedo] = useState(false);

  // Load agents
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const agentList = await agentsApi.list();
        setAgents(agentList);
      } catch (error) {
        console.error('Failed to load agents:', error);
      } finally {
        setAgentsLoading(false);
      }
    };

    loadAgents();
  }, []);

  // Convert stations to React Flow nodes
  useEffect(() => {
    const flowNodes: Node<StationNodeData>[] = stations.map((station) => {
      const agent = agents.find((a) => a.id === station.agent_id);
      return {
        id: station.id,
        type: 'station',
        position: { x: station.x_position, y: station.y_position },
        data: {
          ...station,
          agentName: agent?.name,
          selected: selectedStation?.id === station.id,
        },
      };
    });

    setNodes(flowNodes);
  }, [stations, agents, selectedStation, setNodes]);

  // Convert transitions to React Flow edges
  useEffect(() => {
    const flowEdges: Edge<TransitionEdgeData>[] = transitions.map(
      (transition) => ({
        id: transition.id,
        source: transition.source_station_id,
        target: transition.target_station_id,
        type: 'transition',
        data: {
          ...transition,
          isLoopback: isLoopback(transition),
        },
        animated: transition.condition_type === 'conditional',
      })
    );

    setEdges(flowEdges);
  }, [transitions, setEdges]);

  // Handle node selection
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<StationNodeData>) => {
      const station = stations.find((s) => s.id === node.id);
      setSelectedStation(station || null);
    },
    [stations]
  );

  // Handle edge selection
  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge<TransitionEdgeData>) => {
      const transition = transitions.find((t) => t.id === edge.id);
      setSelectedTransition(transition || null);
      setShowTransitionDialog(true);
    },
    [transitions]
  );

  // Handle node position change
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);

      // Update station positions when nodes are dragged
      changes.forEach((change) => {
        if (change.type === 'position' && change.position && !change.dragging) {
          setStations((prev) =>
            prev.map((station) =>
              station.id === change.id
                ? {
                    ...station,
                    x_position: change.position!.x,
                    y_position: change.position!.y,
                  }
                : station
            )
          );
          setHasUnsavedChanges(true);
        }
      });
    },
    [onNodesChange]
  );

  // Handle edge changes
  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
    },
    [onEdgesChange]
  );

  // Handle new connections
  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Create new transition
      const newTransition: StationTransition = {
        id: `transition-${Date.now()}`,
        workflow_id: 'mock-workflow-id', // TODO: Use real workflow ID
        source_station_id: connection.source,
        target_station_id: connection.target,
        condition: null,
        label: null,
        condition_type: 'always',
        condition_value: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setTransitions((prev) => [...prev, newTransition]);
      setHasUnsavedChanges(true);
    },
    []
  );

  // Handle drop from agent palette
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const agentId = event.dataTransfer.getData('application/vibe-agent');
      if (!agentId) return;

      const agent = agents.find((a) => a.id === agentId);
      if (!agent) return;

      // Get the drop position
      const position = reactFlowInstance.project({
        x: event.clientX,
        y: event.clientY,
      });

      // Create new station
      const newStation: WorkflowStation = {
        id: `station-${Date.now()}`,
        workflow_id: 'mock-workflow-id', // TODO: Use real workflow ID
        name: agent.name,
        position: BigInt(stations.length),
        description: agent.description,
        x_position: position.x,
        y_position: position.y,
        agent_id: agentId,
        station_prompt: null,
        output_context_keys: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setStations((prev) => [...prev, newStation]);
      setHasUnsavedChanges(true);
    },
    [reactFlowInstance, agents, stations.length]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  // Update station
  const handleUpdateStation = useCallback(
    (stationId: string, updates: Partial<WorkflowStation>) => {
      setStations((prev) =>
        prev.map((station) =>
          station.id === stationId ? { ...station, ...updates } : station
        )
      );
      setHasUnsavedChanges(true);
    },
    []
  );

  // Delete station
  const handleDeleteStation = useCallback((stationId: string) => {
    setStations((prev) => prev.filter((s) => s.id !== stationId));
    setTransitions((prev) =>
      prev.filter(
        (t) => t.source_station_id !== stationId && t.target_station_id !== stationId
      )
    );
    setHasUnsavedChanges(true);
  }, []);

  // Update transition
  const handleUpdateTransition = useCallback(
    (transitionId: string, updates: Partial<StationTransition>) => {
      setTransitions((prev) =>
        prev.map((transition) =>
          transition.id === transitionId ? { ...transition, ...updates } : transition
        )
      );
      setHasUnsavedChanges(true);
    },
    []
  );

  // Delete transition
  const handleDeleteTransition = useCallback((transitionId: string) => {
    setTransitions((prev) => prev.filter((t) => t.id !== transitionId));
    setHasUnsavedChanges(true);
  }, []);

  // Toolbar actions
  const handleSave = useCallback(() => {
    setIsSaving(true);
    // TODO: Save workflow to backend
    console.log('Saving workflow...', { stations, transitions });
    setTimeout(() => {
      setIsSaving(false);
      setHasUnsavedChanges(false);
    }, 1000);
  }, [stations, transitions]);

  const handleUndo = useCallback(() => {
    // TODO: Implement undo
    console.log('Undo');
  }, []);

  const handleRedo = useCallback(() => {
    // TODO: Implement redo
    console.log('Redo');
  }, []);

  const handleZoomIn = useCallback(() => {
    reactFlowInstance?.zoomIn();
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    reactFlowInstance?.zoomOut();
  }, [reactFlowInstance]);

  const handleFitView = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.2 });
  }, [reactFlowInstance]);

  const handleValidate = useCallback(() => {
    const result = validateWorkflow(stations, transitions);
    setValidationErrors(result.errors);

    if (result.valid) {
      alert('Workflow is valid!');
    } else {
      alert(`Workflow validation failed:\n\n${result.errors.join('\n')}`);
    }
  }, [stations, transitions]);

  const handleSettings = useCallback(() => {
    // TODO: Open workflow settings dialog
    console.log('Settings');
  }, []);

  // Split tasks into in progress
  const inProgressTasks = useMemo(() => {
    const inProgress: Task[] = [];

    tasks.forEach((task) => {
      const status = task.status.toLowerCase();
      if (status === 'inprogress') {
        inProgress.push(task);
      }
    });

    return inProgress;
  }, [tasks]);

  if (projectError) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Error
          </AlertTitle>
          <AlertDescription>
            {projectError.message || 'Failed to load project'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (projectLoading || tasksLoading || agentsLoading) {
    return (
      <Loader message="Loading factory floor..." size={32} className="py-8" />
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Navigation */}
      <ProjectViewNav currentView="factory" />

      {/* Workflow Toolbar */}
      <WorkflowToolbar
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        onValidate={handleValidate}
        onSettings={handleSettings}
        canUndo={canUndo}
        canRedo={canRedo}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20">
          <div className="text-sm text-destructive font-medium">
            Workflow Validation Issues:
          </div>
          <ul className="text-xs text-destructive/80 list-disc list-inside">
            {validationErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex">
        {/* Left - Agent Palette */}
        <AgentPalette
          agents={agents}
          onCreateAgent={() => console.log('Create agent')}
        />

        {/* Center - React Flow Canvas */}
        <div
          className="flex-1 min-w-0 relative"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onInit={setReactFlowInstance}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            panOnScroll
            zoomOnScroll
            fitView
            minZoom={0.1}
            maxZoom={4}
          >
            <Controls />
            <MiniMap />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>

          {/* Empty state */}
          {stations.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center max-w-md">
                <p className="text-lg font-medium text-muted-foreground mb-2">
                  No workflow stations yet
                </p>
                <p className="text-sm text-muted-foreground">
                  Drag agents from the left palette onto the canvas to create
                  workflow stations. Connect them by dragging from one station's
                  handle to another.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right - Station Config Panel */}
        <StationConfigPanel
          station={selectedStation}
          agents={agents}
          onUpdate={handleUpdateStation}
          onDelete={handleDeleteStation}
          onClose={() => setSelectedStation(null)}
        />
      </div>

      {/* Bottom Tray - In Progress Tasks */}
      <div className="h-32 border-t bg-muted/30 flex flex-col shrink-0">
        <div className="px-3 py-2 border-b bg-card">
          <h2 className="font-semibold text-sm">In Progress</h2>
          <p className="text-xs text-muted-foreground">
            {inProgressTasks.length} tasks
          </p>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-2">
          <div className="flex gap-2 h-full">
            {inProgressTasks.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground p-4 w-full">
                No tasks in progress
              </div>
            ) : (
              inProgressTasks.map((task) => (
                <TaskTrayCard key={task.id} task={task} horizontal />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Transition Config Dialog */}
      <TransitionConfigDialog
        transition={selectedTransition}
        sourceStationName={
          stations.find((s) => s.id === selectedTransition?.source_station_id)
            ?.name
        }
        targetStationName={
          stations.find((s) => s.id === selectedTransition?.target_station_id)
            ?.name
        }
        open={showTransitionDialog}
        onUpdate={handleUpdateTransition}
        onDelete={handleDeleteTransition}
        onClose={() => {
          setShowTransitionDialog(false);
          setSelectedTransition(null);
        }}
      />
    </div>
  );
}
