import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { useProject } from '@/contexts/project-context';
import { useProjectTasks } from '@/hooks/useProjectTasks';
import { agentsApi } from '@/lib/api';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Plus } from 'lucide-react';
import { TaskTrayCard } from '@/components/factory/TaskTrayCard';
import { InProgressTaskCard } from '@/components/factory/InProgressTaskCard';
import { ProjectViewNav } from '@/components/projects/ProjectViewNav';
import { WorkflowToolbar } from '@/components/factory/WorkflowToolbar';
import { TasksLayout } from '@/components/layout/TasksLayout';
import TaskPanel from '@/components/panels/TaskPanel';
import TaskAttemptPanel from '@/components/panels/TaskAttemptPanel';
import { NewCard, NewCardHeader } from '@/components/ui/new-card';
import { TaskPanelHeaderActions } from '@/components/panels/TaskPanelHeaderActions';
import { AttemptHeaderActions } from '@/components/panels/AttemptHeaderActions';
import { useParams, useNavigate } from 'react-router-dom';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TodoPanel from '@/components/tasks/TodoPanel';
import { StationConfigPanel } from '@/components/factory/StationConfigPanel';
import { TransitionConfigDialog } from '@/components/factory/TransitionConfigDialog';
import { WorkflowCreateDialog } from '@/components/factory/WorkflowCreateDialog';
import { StationNode } from '@/components/factory/StationNode';
import { TransitionEdge } from '@/components/factory/TransitionEdge';
import { useWorkflow } from '@/hooks/useWorkflow';
import { useWorkflowStations } from '@/hooks/useWorkflowStations';
import { useWorkflowTransitions } from '@/hooks/useWorkflowTransitions';
import { useWorkflowExecutions } from '@/hooks/useWorkflowExecutions';
import { useReactFlowSync } from '@/hooks/useReactFlowSync';
import { useWorkflowExecution } from '@/hooks/useWorkflowExecution';
import NiceModal from '@ebay/nice-modal-react';
import type { UpdateWorkflowStation } from 'shared/types';

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
  const { taskId, attemptId } = useParams<{ taskId?: string; attemptId?: string }>();
  const navigate = useNavigate();
  const { tasks, isLoading: tasksLoading } = useProjectTasks(projectId || '');

  // Fetch attempt data if attemptId is in URL
  const { data: attempt, isLoading: attemptLoading } = useTaskAttempt(attemptId);
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
  });
  const reactFlowInstance = useReactFlow();
  const viewport = useViewport();

  // Selected task from URL or state
  const selectedTask = useMemo(() => {
    if (!taskId) return null;
    return tasks.find(t => t.id === taskId) || null;
  }, [taskId, tasks]);

  // Create agent lookup map
  const agentMap = useMemo(() => {
    if (!agents) return new Map();
    return new Map(agents.map(agent => [agent.id, agent]));
  }, [agents]);

  // Filter tasks by status
  const inProgressTasks = useMemo(() => {
    return tasks.filter((task) => task.status.toLowerCase() === 'inprogress');
  }, [tasks]);

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
  // When PR #37 (3.0a - Backend execution endpoint) is merged:
  // 1. Add "Execute Workflow" button in WorkflowToolbar
  // 2. Call workflowExecutionsApi.execute() on button click
  // 3. Set activeExecutionId to response.workflow_execution_id
  // 4. Add "Cancel" button to stop execution and clear activeExecutionId
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

  // Fetch workflow executions for in-progress tasks
  const { stationTasksMap, executions } = useWorkflowExecutions(
    effectiveWorkflowId,
    inProgressTasks
  );

  // React Flow sync (with both execution status and active tasks)
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onNodeDragStart,
    onNodeDragStop,
    isValidConnection
  } = useReactFlowSync({
    stations: stations || [],
    transitions: transitions || [],
    stationStatusMap: stationStatusMap,
    stationTasksMap,
    onStationUpdate: (id, data) => {
      // Only send the fields that are actually being updated
      const updateData: UpdateWorkflowStation = {
        name: null,
        position: null,
        description: null,
        x_position: data.x_position ?? null,
        y_position: data.y_position ?? null,
        agent_id: null,
        station_prompt: null,
        output_context_keys: null,
        is_terminator: null,
      };

      updateStation({ id, data: updateData });
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

  // Enrich in-progress task executions with station and agent data
  const enrichedInProgressTasks = useMemo(() => {
    if (!executions || !stations) return [];

    return executions
      .filter(({ execution }) => execution !== null)
      .map(({ task, execution }) => {
        const currentStation = execution!.current_station_id
          ? stations.find(s => s.id === execution!.current_station_id) || null
          : null;

        const agent = currentStation?.agent_id
          ? agentMap.get(currentStation.agent_id) || null
          : null;

        return {
          task,
          execution: execution!,
          currentStation,
          agent,
        };
      });
  }, [executions, stations, agentMap]);

  // Get workflow context for selected task
  const selectedTaskWorkflowContext = useMemo(() => {
    if (!selectedTask) return undefined;

    const enriched = enrichedInProgressTasks.find(e => e.task.id === selectedTask.id);
    if (!enriched) return undefined;

    return {
      station: enriched.currentStation || null,
      agent: enriched.agent || null,
    };
  }, [selectedTask, enrichedInProgressTasks]);

  // Handle task selection
  const handleTaskSelect = useCallback((taskIdToSelect: string) => {
    if (!projectId) return;
    navigate(`/projects/${projectId}/factory/${taskIdToSelect}`);
  }, [projectId, navigate]);

  const handleTaskDeselect = useCallback(() => {
    if (!projectId) return;
    navigate(`/projects/${projectId}/factory`);
  }, [projectId, navigate]);

  // Track if we've loaded saved viewport for this workflow
  const [hasLoadedViewport, setHasLoadedViewport] = useState(false);

  // Zoom indicator visibility
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const zoomTimeoutRef = useRef<number | null>(null);
  const prevZoomRef = useRef<number | null>(null);

  // Stable boolean for nodes existence (prevents thrashing from frequent length changes)
  const hasNodes = nodes.length > 0;

  // Load saved viewport or fit view on first load
  useEffect(() => {
    if (hasNodes && reactFlowInstance && !hasLoadedViewport && effectiveWorkflowId) {
      // Try to load saved viewport from localStorage
      const savedViewportKey = `workflow-viewport-${effectiveWorkflowId}`;
      const savedViewport = localStorage.getItem(savedViewportKey);

      setTimeout(() => {
        if (savedViewport) {
          try {
            const { x, y, zoom } = JSON.parse(savedViewport);
            reactFlowInstance.setViewport({ x, y, zoom });
          } catch (e) {
            // If parsing fails, fall back to fitView
            reactFlowInstance.fitView({ padding: 0.2 });
          }
        } else {
          // No saved viewport, fit to show all stations
          reactFlowInstance.fitView({ padding: 0.2 });
        }
        setHasLoadedViewport(true);
      }, 100);
    }
  }, [hasNodes, reactFlowInstance, hasLoadedViewport, effectiveWorkflowId]);

  // Reset viewport state when workflow changes
  useEffect(() => {
    setHasLoadedViewport(false);
  }, [effectiveWorkflowId]);

  // Save viewport changes to localStorage
  const handleViewportChange = useCallback(
    (newViewport: { x: number; y: number; zoom: number }) => {
      if (effectiveWorkflowId) {
        const savedViewportKey = `workflow-viewport-${effectiveWorkflowId}`;
        localStorage.setItem(savedViewportKey, JSON.stringify(newViewport));

        // Only show zoom indicator if zoom level changed (not just pan)
        if (prevZoomRef.current !== null && prevZoomRef.current !== newViewport.zoom) {
          setShowZoomIndicator(true);

          // Clear existing timeout
          if (zoomTimeoutRef.current) {
            clearTimeout(zoomTimeoutRef.current);
          }

          // Hide after 1.5 seconds
          const timeout = setTimeout(() => {
            setShowZoomIndicator(false);
          }, 1500);
          zoomTimeoutRef.current = timeout as unknown as number;
        }

        // Update previous zoom reference
        prevZoomRef.current = newViewport.zoom;
      }
    },
    [effectiveWorkflowId]
  );

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
        is_terminator: false, // Explicit default - stations are non-terminators by default
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

  // Split tasks into todo
  const todoTasks = useMemo(() => {
    return tasks.filter((task) => task.status.toLowerCase() === 'todo');
  }, [tasks]);

  // Determine if we're viewing attempt
  const isAttemptView = !!taskId && !!attemptId;

  // Right panel content - switch between TaskPanel and TaskAttemptPanel
  const rightPanelContent = useMemo(() => {
    if (!selectedTask) return null;

    if (isAttemptView && attempt) {
      // Show full agent experience with logs and follow-up
      return (
        <NewCard className="h-full min-h-0 flex flex-col bg-diagonal-lines bg-muted border-0">
          <TaskAttemptPanel attempt={attempt} task={selectedTask}>
            {({ logs, followUp }) => (
              <Tabs defaultValue="logs" className="flex-1 flex flex-col min-h-0">
                <TabsList className="shrink-0 mx-2 mt-2">
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                  <TabsTrigger value="todos">Todos</TabsTrigger>
                  <TabsTrigger value="followup">Follow-up</TabsTrigger>
                </TabsList>
                <TabsContent value="logs" className="flex-1 min-h-0 mt-0">
                  {logs}
                </TabsContent>
                <TabsContent value="todos" className="flex-1 min-h-0 mt-0 overflow-auto">
                  <TodoPanel />
                </TabsContent>
                <TabsContent value="followup" className="flex-1 min-h-0 mt-0 overflow-auto">
                  {followUp}
                </TabsContent>
              </Tabs>
            )}
          </TaskAttemptPanel>
        </NewCard>
      );
    }

    // Show task overview
    return (
      <NewCard className="h-full min-h-0 flex flex-col bg-diagonal-lines bg-muted border-0">
        <TaskPanel task={selectedTask} workflowContext={selectedTaskWorkflowContext} />
      </NewCard>
    );
  }, [selectedTask, isAttemptView, attempt, selectedTaskWorkflowContext]);

  // Right panel header - different for task vs attempt view
  const rightPanelHeader = useMemo(() => {
    if (!selectedTask) return null;

    if (isAttemptView && attempt) {
      // Attempt view header with breadcrumb
      return (
        <NewCardHeader
          className="shrink-0"
          actions={
            <AttemptHeaderActions
              task={selectedTask}
              attempt={attempt}
              onClose={handleTaskDeselect}
            />
          }
        >
          <div className="mx-auto w-full text-sm font-medium truncate">
            <button
              onClick={() => {
                if (projectId) {
                  navigate(`/projects/${projectId}/factory/${selectedTask.id}`);
                }
              }}
              className="hover:underline text-muted-foreground"
            >
              {selectedTask.title}
            </button>
            <span className="text-muted-foreground mx-2">›</span>
            <span>{attempt.branch || 'Task Attempt'}</span>
          </div>
        </NewCardHeader>
      );
    }

    // Task view header
    return (
      <NewCardHeader
        className="shrink-0"
        actions={
          <TaskPanelHeaderActions
            task={selectedTask}
            onClose={handleTaskDeselect}
          />
        }
      >
        <div className="mx-auto w-full text-sm font-medium truncate">
          {selectedTask.title}
        </div>
      </NewCardHeader>
    );
  }, [selectedTask, isAttemptView, attempt, projectId, navigate, handleTaskDeselect]);

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
    transitionsLoading ||
    (attemptId && attemptLoading)
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
        <TasksLayout
          kanban={
            <div className="flex h-full w-full">
          {/* Left Sidebar - Task Lists */}
          <div className="w-80 border-r bg-muted/30 flex flex-col shrink-0">
            {/* To Do Section */}
            <div className="flex flex-col shrink-0">
              <div className="px-3 py-2 border-b bg-card">
                <h2 className="font-semibold text-sm">To Do</h2>
                <p className="text-xs text-muted-foreground">
                  {todoTasks.length} tasks • Select workflow to start
                </p>
              </div>
              <div className="max-h-[40vh] overflow-y-auto p-2">
                <div className="space-y-2">
                  {todoTasks.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground p-4">
                      No tasks to do
                    </div>
                  ) : (
                    todoTasks.map((task) => (
                      <TaskTrayCard
                        key={task.id}
                        task={task}
                        projectId={projectId || undefined}
                        onSelect={handleTaskSelect}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* In Progress Section */}
            <div className="flex-1 flex flex-col min-h-0 border-t">
              <div className="px-3 py-2 border-b bg-card shrink-0">
                <h2 className="font-semibold text-sm">In Progress</h2>
                <p className="text-xs text-muted-foreground">
                  {enrichedInProgressTasks.length} tasks running
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-2">
                  {enrichedInProgressTasks.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground p-4">
                      No tasks in progress
                    </div>
                  ) : (
                    enrichedInProgressTasks.map(({ task, execution, currentStation, agent }) => (
                      <InProgressTaskCard
                        key={task.id}
                        task={task}
                        execution={execution}
                        currentStation={currentStation}
                        agent={agent}
                        onSelect={handleTaskSelect}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

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
                onNodeDragStart={onNodeDragStart}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                onConnect={handleConnect}
                onMove={(_event, newViewport) => handleViewportChange(newViewport)}
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
                <Panel
                  position="bottom-left"
                  className={`bg-background/95 backdrop-blur-sm border rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-opacity duration-300 ${
                    showZoomIndicator ? 'opacity-100' : 'opacity-0'
                  }`}
                >
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
          }
          attempt={rightPanelContent}
          aux={null}
          isPanelOpen={!!selectedTask}
          mode={null}
          isMobile={false}
          rightHeader={rightPanelHeader}
        />

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
