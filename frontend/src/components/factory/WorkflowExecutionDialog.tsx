import { useQuery } from '@tanstack/react-query';
import { workflowExecutionsApi } from '@/lib/api';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import type { StationExecutionSummary } from 'shared/types';

interface WorkflowExecutionDialogProps {
  taskId: string;
  workflowExecutionId?: string;
}

export const WorkflowExecutionDialog = NiceModal.create<WorkflowExecutionDialogProps>(
  ({ taskId, workflowExecutionId }) => {
    const modal = useModal();

    // Fetch workflow execution details
    const { data: execution, isLoading, error } = useQuery({
      queryKey: ['workflow-execution', taskId, workflowExecutionId],
      queryFn: async () => {
        if (workflowExecutionId) {
          return workflowExecutionsApi.getById(workflowExecutionId);
        }
        return workflowExecutionsApi.getTaskExecution(taskId);
      },
      refetchInterval: (query) => {
        // Poll every 2 seconds if execution is running
        if (query.state.data?.status === 'running') return 2000;
        return false;
      },
    });

    const getStatusIcon = (status: string) => {
      switch (status.toLowerCase()) {
        case 'completed':
          return <CheckCircle className="h-4 w-4 text-green-500" />;
        case 'failed':
          return <XCircle className="h-4 w-4 text-destructive" />;
        case 'running':
          return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
        case 'pending':
          return <Clock className="h-4 w-4 text-muted-foreground" />;
        default:
          return null;
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={(open) => !open && modal.hide()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Workflow Execution</DialogTitle>
            <DialogDescription>
              Monitor the progress of your workflow execution
            </DialogDescription>
          </DialogHeader>

          {isLoading && (
            <Loader message="Loading execution details..." size={24} />
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load execution details: {error instanceof Error ? error.message : 'Unknown error'}
              </AlertDescription>
            </Alert>
          )}

          {execution && (
            <div className="space-y-4">
              {/* Execution status */}
              <div className="flex items-center gap-2">
                {getStatusIcon(execution.status)}
                <span className="font-medium capitalize">{execution.status}</span>
              </div>

              {/* Station executions */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Stations</h3>
                {execution.stations && execution.stations.length > 0 ? (
                  <div className="space-y-2">
                    {execution.stations.map((station: StationExecutionSummary) => (
                      <div
                        key={station.id}
                        className="flex items-center justify-between p-3 border rounded-md bg-card"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          {getStatusIcon(station.status)}
                          <span className="text-sm">
                            {station.station_name || 'Unknown Station'}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground capitalize">
                          {station.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No stations executed yet</p>
                )}
              </div>

              {/* Timing info */}
              {execution.started_at && (
                <div className="text-xs text-muted-foreground">
                  <p>Started: {new Date(execution.started_at).toLocaleString()}</p>
                  {execution.completed_at && (
                    <p>Completed: {new Date(execution.completed_at).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {!execution && !isLoading && !error && (
            <Alert>
              <AlertDescription>
                No active workflow execution found for this task
              </AlertDescription>
            </Alert>
          )}
        </DialogContent>
      </Dialog>
    );
  }
);
