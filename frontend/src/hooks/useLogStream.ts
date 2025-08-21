import { useEffect, useState, useRef } from 'react';
import type { PatchType, ExecutionProcess } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface UseLogStreamResult {
  logs: LogEntry[];
  error: string | null;
}

export const useLogStream = (processId: string, executionProcess?: ExecutionProcess): UseLogStreamResult => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const firstLogReceivedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!processId) {
      return;
    }

    // Clear logs when process changes
    setLogs([]);
    setError(null);
    firstLogReceivedRef.current = false;
    
    if (executionProcess) {
      const processCreatedTime = new Date(executionProcess.created_at).getTime();
      console.log(`🏁 Frontend: Starting log stream for process ${processId} (process created at ${executionProcess.created_at})`);
    }

    const eventSource = new EventSource(
      `/api/execution-processes/${processId}/raw-logs`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setError(null);
    };

    const addLogEntry = (entry: LogEntry) => {
      if (!firstLogReceivedRef.current && executionProcess) {
        const processCreatedTime = new Date(executionProcess.created_at).getTime();
        const timeToFirstLog = Date.now() - processCreatedTime;
        console.log(`🎉 Frontend: First log entry received after ${timeToFirstLog}ms from process creation (process: ${processId})`);
        firstLogReceivedRef.current = true;
      }
      setLogs((prev) => [...prev, entry]);
    };

    // Handle json_patch events (new format from server)
    eventSource.addEventListener('json_patch', (event) => {
      try {
        const patches = JSON.parse(event.data);
        patches.forEach((patch: any) => {
          const value = patch?.value;
          if (!value || !value.type) return;

          switch (value.type) {
            case 'STDOUT':
            case 'STDERR':
              addLogEntry({ type: value.type, content: value.content });
              break;
            // Ignore other patch types (NORMALIZED_ENTRY, DIFF, etc.)
            default:
              break;
          }
        });
      } catch (e) {
        console.error('Failed to parse json_patch:', e);
      }
    });

    eventSource.addEventListener('finished', () => {
      eventSource.close();
    });

    eventSource.onerror = () => {
      setError('Connection failed');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [processId]);

  return { logs, error };
};
