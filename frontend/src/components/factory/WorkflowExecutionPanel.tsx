import { useState } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Circle,
  ExternalLink,
  StopCircle,
  RotateCcw,
} from 'lucide-react';
import { useWorkflowExecution } from '@/hooks/useWorkflowExecution';
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
import { workflowExecutionApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { NewCardContent, NewCardHeader } from '@/components/ui/new-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { StationExecutionSummary, ExecutionProcess } from 'shared/types';
import { Link } from 'react-router-dom';

interface WorkflowExecutionPanelProps {
  executionId: string | undefined;
  isOpen: boolean;
  onClose: () => void;
}

export function WorkflowExecutionPanel({
  executionId,
  isOpen,
  onClose,
}: WorkflowExecutionPanelProps) {
  const { execution, stations, currentStation, isLoading, error, refetch } =
    useWorkflowExecution(executionId);
  const [selectedStation, setSelectedStation] =
    useState<StationExecutionSummary | null>(null);
  const [isActioning, setIsActioning] = useState(false);

  // Get execution processes for the task attempt
  const taskAttemptId = execution?.task_attempt_id ?? undefined;
  const {
    executionProcesses,
    isAttemptRunning,
    isConnected: processesConnected,
  } = useExecutionProcesses(taskAttemptId ?? '', {
    showSoftDeleted: false,
  });

  // Handle cancel workflow
  const handleCancel = async () => {
    if (
      !executionId ||
      !confirm('Are you sure you want to cancel this workflow execution?')
    )
      return;

    setIsActioning(true);
    try {
      await workflowExecutionApi.cancel(executionId, {
        reason: 'Cancelled by user',
      });
      await refetch();
    } catch (err) {
      console.error('Failed to cancel workflow:', err);
      alert(
        `Failed to cancel workflow: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setIsActioning(false);
    }
  };

  // Handle retry failed station
  const handleRetryStation = async (stationExecutionId: string) => {
    if (!executionId) return;

    setIsActioning(true);
    try {
      await workflowExecutionApi.retryStation(executionId, {
        station_execution_id: stationExecutionId,
      });
      await refetch();
    } catch (err) {
      console.error('Failed to retry station:', err);
      alert(
        `Failed to retry station: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setIsActioning(false);
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'running':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse';
      case 'failed':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'cancelled':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
      case 'pending':
        return 'bg-gray-400/10 text-gray-400 border-gray-400/20';
      default:
        return 'bg-gray-300/10 text-gray-300 border-gray-300/20';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'running':
        return <Clock className="h-4 w-4 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      case 'cancelled':
        return <StopCircle className="h-4 w-4" />;
      case 'pending':
        return <Circle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Calculate duration
  const calculateDuration = (
    startedAt: string | null,
    completedAt: string | null
  ) => {
    if (!startedAt) return 'N/A';
    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const durationSec = Math.floor(durationMs / 1000);
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    return `${minutes}m ${seconds}s`;
  };

  if (!isOpen || !executionId) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          'fixed inset-y-0 right-0 w-full md:w-[700px] z-50',
          'bg-background border-l shadow-xl',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <NewCardHeader
            actions={
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            }
          >
            <div className="flex items-center justify-between flex-1">
              <h2 className="text-lg font-semibold">Workflow Execution</h2>
              {execution && (
                <Badge
                  variant="outline"
                  className={getStatusColor(execution.status)}
                >
                  {getStatusIcon(execution.status)}
                  <span className="ml-1.5 capitalize">{execution.status}</span>
                </Badge>
              )}
            </div>
          </NewCardHeader>

          {/* Content */}
          <NewCardContent className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center h-32">
                <div className="text-muted-foreground">Loading...</div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-destructive/10 text-destructive rounded-md">
                <p className="font-medium">Error loading workflow execution</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            )}

            {execution && (
              <div className="p-4 space-y-6">
                {/* Task Context */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Task Context
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Task ID:</span>
                      <Link
                        to={`/tasks/${execution.task_id}`}
                        className="ml-2 text-blue-500 hover:underline inline-flex items-center gap-1"
                      >
                        {execution.task_id.substring(0, 8)}...
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                    {execution.task_attempt_id && (
                      <div>
                        <span className="text-muted-foreground">
                          Attempt ID:
                        </span>
                        <Link
                          to={`/attempts/${execution.task_attempt_id}`}
                          className="ml-2 text-blue-500 hover:underline inline-flex items-center gap-1"
                        >
                          {execution.task_attempt_id.substring(0, 8)}...
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                    <div>
                      <span className="text-muted-foreground">Started:</span>
                      <span className="ml-2">
                        {formatTimestamp(execution.started_at)}
                      </span>
                    </div>
                    {execution.completed_at && (
                      <div>
                        <span className="text-muted-foreground">Completed:</span>
                        <span className="ml-2">
                          {formatTimestamp(execution.completed_at)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="ml-2">
                      {calculateDuration(
                        execution.started_at,
                        execution.completed_at
                      )}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                {(execution.status === 'running' ||
                  execution.status === 'pending') && (
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleCancel}
                      disabled={isActioning}
                    >
                      <StopCircle className="h-4 w-4 mr-2" />
                      Cancel Workflow
                    </Button>
                  </div>
                )}

                {/* Tabs */}
                <Tabs defaultValue="timeline" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="current">Current Station</TabsTrigger>
                    <TabsTrigger value="all">All Stations</TabsTrigger>
                  </TabsList>

                  {/* Timeline Tab */}
                  <TabsContent value="timeline" className="space-y-4 mt-4">
                    <div className="relative">
                      {/* Timeline connector */}
                      <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border" />

                      {/* Station timeline items */}
                      {stations.map((station) => (
                        <div
                          key={station.id}
                          className="relative flex items-start gap-4 pb-6 last:pb-0"
                        >
                          {/* Status indicator */}
                          <div
                            className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                              station.status === 'completed'
                                ? 'bg-green-500 border-green-500'
                                : station.status === 'running'
                                  ? 'bg-blue-500 border-blue-500 animate-pulse'
                                  : station.status === 'failed'
                                    ? 'bg-red-500 border-red-500'
                                    : 'bg-background border-border'
                            }`}
                          >
                            {getStatusIcon(station.status)}
                          </div>

                          {/* Station info */}
                          <div
                            className="flex-1 cursor-pointer hover:bg-muted/50 rounded-md p-3 -ml-1"
                            onClick={() => setSelectedStation(station)}
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">
                                {station.station_name || 'Unnamed Station'}
                              </h4>
                              <Badge
                                variant="outline"
                                className={`${getStatusColor(station.status)} text-xs`}
                              >
                                {station.status}
                              </Badge>
                            </div>
                            {station.started_at && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Duration:{' '}
                                {calculateDuration(
                                  station.started_at,
                                  station.completed_at
                                )}
                              </p>
                            )}
                            {station.status === 'failed' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRetryStation(station.id);
                                }}
                                disabled={isActioning}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Retry
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  {/* Current Station Tab */}
                  <TabsContent value="current" className="space-y-4 mt-4">
                    {currentStation ? (
                      <StationDetails
                        station={currentStation}
                        executionProcesses={executionProcesses}
                        isAttemptRunning={isAttemptRunning}
                        processesConnected={processesConnected}
                        onRetry={handleRetryStation}
                        isActioning={isActioning}
                      />
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No active station
                      </div>
                    )}
                  </TabsContent>

                  {/* All Stations Tab */}
                  <TabsContent value="all" className="space-y-4 mt-4">
                    {stations.map((station) => (
                      <div
                        key={station.id}
                        className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer"
                        onClick={() => setSelectedStation(station)}
                      >
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">
                            {station.station_name || 'Unnamed Station'}
                          </h4>
                          <Badge
                            variant="outline"
                            className={getStatusColor(station.status)}
                          >
                            {getStatusIcon(station.status)}
                            <span className="ml-1.5">{station.status}</span>
                          </Badge>
                        </div>
                        {station.started_at && (
                          <div className="text-sm text-muted-foreground mt-2">
                            <p>
                              Started: {formatTimestamp(station.started_at)}
                            </p>
                            {station.completed_at && (
                              <p>
                                Completed:{' '}
                                {formatTimestamp(station.completed_at)}
                              </p>
                            )}
                            <p>
                              Duration:{' '}
                              {calculateDuration(
                                station.started_at,
                                station.completed_at
                              )}
                            </p>
                          </div>
                        )}
                        {station.status === 'failed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetryStation(station.id);
                            }}
                            disabled={isActioning}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        )}
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>

                {/* Selected Station Details Modal */}
                {selectedStation && (
                  <div
                    className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
                    onClick={() => setSelectedStation(null)}
                  >
                    <div
                      className="bg-background rounded-lg border shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">
                            {selectedStation.station_name || 'Unnamed Station'}
                          </h3>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedStation(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <StationDetails
                          station={selectedStation}
                          executionProcesses={executionProcesses}
                          isAttemptRunning={isAttemptRunning}
                          processesConnected={processesConnected}
                          onRetry={handleRetryStation}
                          isActioning={isActioning}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </NewCardContent>
        </div>
      </div>
    </>
  );
}

// Station Details Component
interface StationDetailsProps {
  station: StationExecutionSummary;
  executionProcesses: ExecutionProcess[];
  isAttemptRunning: boolean;
  processesConnected: boolean;
  onRetry: (stationExecutionId: string) => void;
  isActioning: boolean;
}

function StationDetails({
  station,
  executionProcesses,
  isAttemptRunning,
  processesConnected,
  onRetry,
  isActioning,
}: StationDetailsProps) {
  // Parse output data if available
  const outputData = station.output_data
    ? (() => {
        try {
          return JSON.parse(station.output_data);
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="space-y-4">
      {/* Station Status */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2">
          Status
        </h4>
        <Badge variant="outline" className="text-sm">
          {station.status}
        </Badge>
      </div>

      {/* Timestamps */}
      {station.started_at && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Timing
          </h4>
          <div className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Started:</span>{' '}
              {new Date(station.started_at).toLocaleString()}
            </p>
            {station.completed_at && (
              <p>
                <span className="text-muted-foreground">Completed:</span>{' '}
                {new Date(station.completed_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Output Data */}
      {outputData && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Output Data
          </h4>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
            {JSON.stringify(outputData, null, 2)}
          </pre>
        </div>
      )}

      {/* Execution Processes */}
      {executionProcesses.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            Execution Processes
          </h4>
          <div className="space-y-2">
            {executionProcesses.map((process) => (
              <div
                key={process.id}
                className="text-sm border rounded-md p-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{process.run_reason}</span>
                  <Badge variant="outline" className="text-xs">
                    {process.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  ID: {process.id.substring(0, 8)}...
                </p>
                {process.exit_code !== null && (
                  <p className="text-xs text-muted-foreground">
                    Exit code: {process.exit_code}
                  </p>
                )}
              </div>
            ))}
          </div>
          {isAttemptRunning && (
            <p className="text-xs text-muted-foreground mt-2">
              {processesConnected ? '🟢 Live updates' : '🔴 Disconnected'}
            </p>
          )}
        </div>
      )}

      {/* Retry Button */}
      {station.status === 'failed' && (
        <Button
          variant="outline"
          onClick={() => onRetry(station.id)}
          disabled={isActioning}
          className="w-full"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Retry Station
        </Button>
      )}
    </div>
  );
}
