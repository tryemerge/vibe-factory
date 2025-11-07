import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  Panel,
  SelectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';
// Removed @dnd-kit/core - no longer using agent drag-and-drop
import { useProject } from '@/contexts/project-context';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Plus } from 'lucide-react';
import { TaskTrayCard } from '@/components/factory/TaskTrayCard';
import { ProjectViewNav } from '@/components/projects/ProjectViewNav';
import { WorkflowToolbar } from '@/components/factory/WorkflowToolbar';
import { StationConfigPanel } from '@/components/factory/StationConfigPanel';
import { TransitionConfigDialog } from '@/components/factory/TransitionConfigDialog';
import { WorkflowCreateDialog } from '@/components/factory/WorkflowCreateDialog';
import { StationNode } from '@/components/factory/StationNode';
import { TransitionEdge } from '@/components/factory/TransitionEdge';
import { useWorkflow } from '@/hooks/useWorkflow';
import { useWorkflowStations } from '@/hooks/useWorkflowStations';
import { useWorkflowTransitions } from '@/hooks/useWorkflowTransitions';
import { useReactFlowSync } from '@/hooks/useReactFlowSync';
import { useWorkflowExecution } from '@/hooks/useWorkflowExecution';
import NiceModal from '@ebay/nice-modal-react';

// Custom node and edge types
const nodeTypes = {
  station: StationNode,
};

const edgeTypes = {
  transition: TransitionEdge,
};

function FactoryFloorContent() {
  const {
    projectId,
    isLoading: projectLoading,
    error: projectError,
  } = useProject();
  const { tasks, isLoading: tasksLoading } = useProjectTasks(projectId || '');
  const reactFlowInstance = useReactFlow();
  const viewport = useViewport();

  // Workflow state - get all workflows for this project
  const {
    workflows,
    isLoading: workflowsLoading,
    isSaving: workflowSaving,
    createWorkflow,
    deleteWorkflow,
  } = useWorkflow({ projectId: projectId || undefined });

  // Selected workflow ID
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null
  );

  // Active workflow execution ID (if a workflow is currently running)
  // TODO: Wire this up to workflow execution start/stop actions
  const [activeExecutionId] = useState<string | null>(
    null
  );

  // Track workflow execution status with polling when running
  const {
    stationStatusMap,
    progress,
    isRunning: executionIsRunning,
  } = useWorkflowExecution({
    executionId: activeExecutionId || undefined,
    enabled: !!activeExecutionId,
    // Poll every 2 seconds when execution is active
    refetchInterval: activeExecutionId ? 2000 : false,
  });

  // Automatically select first workflow if available
  const effectiveWorkflowId = useMemo(() => {
    if (selectedWorkflowId) return selectedWorkflowId;
    if (workflows && workflows.length > 0) {
      return workflows[0].id;
    }
    return null;
  }, [selectedWorkflowId, workflows]);

  // Update selection when workflows load
  useState(() => {
    if (effectiveWorkflowId) {
      setSelectedWorkflowId(effectiveWorkflowId);
    }
  });

  // Stations and transitions hooks
  const {
    stations,
    isLoading: stationsLoading,
    createStation,
    updateStation,
  } = useWorkflowStations({
    workflowId: effectiveWorkflowId || undefined,
  });

  const {
    transitions,
    isLoading: transitionsLoading,
    createTransition,
    updateTransition,
    deleteTransition,
  } = useWorkflowTransitions({
    workflowId: effectiveWorkflowId || undefined,
  });

  // React Flow sync (with execution status)
  const { nodes, edges, onNodesChange, onEdgesChange, isValidConnection } = useReactFlowSync({
    stations: stations || [],
    transitions: transitions || [],
    stationStatusMap: stationStatusMap,
    onStationUpdate: (id, data) => {
      updateStation({
        id,
        data: {
          name: null,
          position: null,
          description: null,
          x_position: null,
          y_position: null,
          agent_id: null,
          station_prompt: null,
          output_context_keys: null,
          ...data,
        },
      });
    },
  });

  // UI state
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null
  );

  // Get selected station object
  const selectedStation = useMemo(() => {
    if (!selectedStationId || !stations) return null;
    return stations.find((s) => s.id === selectedStationId) || null;
  }, [selectedStationId, stations]);

  // Handle new workflow creation
  const handleNewWorkflow = useCallback(() => {
    if (!projectId) return;

    NiceModal.show(WorkflowCreateDialog, {
      projectId,
      onSave: async (data) => {
        return new Promise<void>((resolve, reject) => {
          createWorkflow(
            { projectId, data },
            {
              onSuccess: (workflow) => {
                setSelectedWorkflowId(workflow.id);
                resolve();
              },
              onError: (error) => {
                reject(error);
              },
            }
          );
        });
      },
    });
  }, [projectId, createWorkflow]);

  // Handle workflow deletion
  const handleDeleteWorkflow = useCallback(() => {
    if (!effectiveWorkflowId) return;

    const workflow = workflows?.find((w) => w.id === effectiveWorkflowId);
    if (!workflow) return;

    if (confirm(`Delete workflow "${workflow.name}"?`)) {
      deleteWorkflow(effectiveWorkflowId, {
        onSuccess: () => {
          setSelectedWorkflowId(null);
        },
      });
    }
  }, [effectiveWorkflowId, workflows, deleteWorkflow]);

  // Handle adding a new station
  const handleAddStation = useCallback(() => {
    if (!effectiveWorkflowId) return;

    // Create station at center of viewport
    const center = {
      x: viewport.x + window.innerWidth / 2,
      y: viewport.y + window.innerHeight / 2,
    };

    createStation({
      workflowId: effectiveWorkflowId,
      data: {
        workflow_id: effectiveWorkflowId,
        name: `Station ${(stations?.length || 0) + 1}`,
        position: BigInt(stations?.length || 0),
        description: null,
        x_position: center.x,
        y_position: center.y,
        agent_id: null,
        station_prompt: null,
        output_context_keys: null,
      },
    });
  }, [effectiveWorkflowId, stations, viewport, createStation]);

  // Handle station node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }) => {
      setSelectedStationId(node.id);
    },
    []
  );

  // Handle edge click - open transition dialog
  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: { id: string }) => {
      const transition = transitions?.find((t) => t.id === edge.id);
      if (!transition) return;

      const sourceStation = stations?.find(
        (s) => s.id === transition.source_station_id
      );
      const targetStation = stations?.find(
        (s) => s.id === transition.target_station_id
      );

      if (!sourceStation || !targetStation) return;

      NiceModal.show(TransitionConfigDialog, {
        transition,
        sourceStation,
        targetStation,
        onSave: async (data) => {
          await updateTransition({ id: transition.id, data });
        },
        onRemove: async () => {
          await deleteTransition(transition.id);
        },
      });
    },
    [transitions, stations, updateTransition, deleteTransition]
  );

  // Handle new connection
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!effectiveWorkflowId || !connection.source || !connection.target) {
        return;
      }

      // Validate connection with non-null source/target
      if (!isValidConnection({ source: connection.source, target: connection.target })) {
        return;
      }

      const sourceStation = stations?.find((s) => s.id === connection.source);
      const targetStation = stations?.find((s) => s.id === connection.target);

      if (!sourceStation || !targetStation) return;

      // Open dialog to configure transition before creating
      NiceModal.show(TransitionConfigDialog, {
        sourceStation,
        targetStation,
        onSave: async (data) => {
          await createTransition({
            workflowId: effectiveWorkflowId,
            data: {
              workflow_id: effectiveWorkflowId,
              source_station_id: sourceStation.id,
              target_station_id: targetStation.id,
              ...data,
            },
          });
        },
      });
    },
    [effectiveWorkflowId, stations, isValidConnection, createTransition]
  );

  // Toolbar actions
  const handleSave = useCallback(() => {
    // Workflow is auto-saved via hooks, this is just for UX feedback
    console.log('Workflow auto-saved');
  }, []);

  const handleZoomIn = useCallback(() => {
    reactFlowInstance.zoomIn();
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    reactFlowInstance.zoomOut();
  }, [reactFlowInstance]);

  const handleAutoLayout = useCallback(() => {
    // Center the viewport and set zoom to 100% (1.0)
    reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
  }, [reactFlowInstance]);

  const handleExportJson = useCallback(() => {
    if (!effectiveWorkflowId) return;

    const workflow = workflows?.find((w) => w.id === effectiveWorkflowId);
    if (!workflow) return;

    const data = {
      workflow,
      stations,
      transitions,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [effectiveWorkflowId, workflows, stations, transitions]);

  // Split tasks into in progress
  const inProgressTasks = useMemo(() => {
    return tasks.filter((task) => task.status.toLowerCase() === 'inprogress');
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

  if (
    projectLoading ||
    tasksLoading ||
    workflowsLoading ||
    stationsLoading ||
    transitionsLoading
  ) {
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
          workflows={workflows || []}
          selectedWorkflowId={effectiveWorkflowId}
          onSelectWorkflow={setSelectedWorkflowId}
          onNewWorkflow={handleNewWorkflow}
          onSave={handleSave}
          onDelete={handleDeleteWorkflow}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onAutoLayout={handleAutoLayout}
          onExportJson={handleExportJson}
          hasUnsavedChanges={false} // Auto-save means no unsaved changes
          disabled={workflowSaving}
          executionProgress={progress}
          isExecutionRunning={executionIsRunning}
        />

        {/* Main content area */}
        <div className="flex-1 min-h-0 flex">
          {/* React Flow Canvas */}
          <div className="flex-1 min-w-0 relative bg-muted/10">
            {!effectiveWorkflowId ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center max-w-md space-y-4">
                  <p className="text-lg font-medium text-muted-foreground">
                    No workflows yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Create a workflow to start building your agent pipeline
                  </p>
                </div>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                onConnect={handleConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={true}
                nodesConnectable={true}
                elementsSelectable={true}
                panOnDrag={false}
                selectionOnDrag={true}
                selectionMode={SelectionMode.Partial}
                panOnScroll
                zoomOnScroll
                minZoom={0.1}
                maxZoom={4}
              >
                <Controls />
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={12}
                  size={1}
                />
                <Panel position="bottom-left" className="bg-background/95 backdrop-blur-sm border rounded-md px-2 py-1 text-xs font-medium text-muted-foreground">
                  {Math.round(viewport.zoom * 100)}%
                </Panel>
                <Panel position="top-left" className="m-2">
                  <Button
                    onClick={handleAddStation}
                    size="sm"
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Station
                  </Button>
                </Panel>
              </ReactFlow>
            )}

            {/* Empty state for workflow with no stations */}
            {effectiveWorkflowId && nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center max-w-md">
                  <p className="text-lg font-medium text-muted-foreground mb-2">
                    No stations yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Click "Add Station" to create a station. Then configure the
                    agent and prompt for each station. Connect stations by dragging
                    from one station's handle to another.
                  </p>
                </div>
              </div>
            )}
          </div>
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

        {/* Station Config Panel (overlay) */}
        <StationConfigPanel
          station={selectedStation}
          isOpen={!!selectedStationId}
          onClose={() => setSelectedStationId(null)}
        />
      </div>
  );
}

export function FactoryFloorPage() {
  return (
    <ReactFlowProvider>
      <FactoryFloorContent />
    </ReactFlowProvider>
  );
}
