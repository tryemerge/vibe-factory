import React, { useContext, useMemo } from 'react';
import { Circle, CircleCheck, CircleDotDashed } from 'lucide-react';
import { useProcessesLogs } from '@/hooks/useProcessesLogs';
import { usePinnedTodos } from '@/hooks/usePinnedTodos';
import { TaskAttemptDataContext } from '@/components/context/taskDetailsContext';
import { shouldShowInLogs } from '@/constants/processes';

function getStatusIcon(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'completed')
    return <CircleCheck size={16} className="mr-2 text-green-600 mt-0.5" />;
  if (s === 'in_progress' || s === 'in-progress')
    return <CircleDotDashed size={16} className="mr-2 text-blue-500 mt-0.5" />;
  return <Circle size={16} className="mr-2 text-muted-foreground mt-0.5" />;
}

export function TaskBreakdownPanel() {
  const { attemptData } = useContext(TaskAttemptDataContext);

  const filteredProcesses = useMemo(
    () =>
      (attemptData.processes || []).filter((p) =>
        shouldShowInLogs(p.run_reason)
      ),
    [attemptData.processes?.map((p) => p.id).join(',')]
  );

  const { entries } = useProcessesLogs(filteredProcesses, true);
  const { todos } = usePinnedTodos(entries);

  // Only show once the agent has created subtasks
  if (!todos || todos.length === 0) return null;

  return (
    <div className="bg-background rounded-lg overflow-hidden border">
      <div className="p-4">
        <h3 className="font-medium mb-3">TODOs</h3>
        <ul className="space-y-2">
          {todos.map((todo, index) => (
            <li key={`${todo.content}-${index}`} className="flex items-start">
              {getStatusIcon(todo.status)}
              <span>{todo.content}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default TaskBreakdownPanel;
