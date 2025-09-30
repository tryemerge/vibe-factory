import { useState } from 'react';
import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import CreateAttempt from '@/components/tasks/Toolbar/CreateAttempt.tsx';
import CurrentAttempt from '@/components/tasks/Toolbar/CurrentAttempt.tsx';
import { Card } from '../ui/card';

function TaskDetailsToolbar({
  task,
  projectHasDevScript,
  attempts,
  selectedAttempt,
}: {
  task: TaskWithAttemptStatus;
  projectHasDevScript?: boolean;
  attempts: TaskAttempt[];
  selectedAttempt: TaskAttempt | null;
}) {
  // UI state
  const [userForcedCreateMode, setUserForcedCreateMode] = useState(false);

  // Derived state
  const isInCreateAttemptMode =
    userForcedCreateMode || attempts.length === 0 || !selectedAttempt;

  return (
    <>
      <div>
        {isInCreateAttemptMode ? (
          <CreateAttempt
            task={task}
            taskAttempts={attempts}
            onExitCreateMode={() => setUserForcedCreateMode(false)}
            selectedAttempt={selectedAttempt}
          />
        ) : (
          <div className="">
            <Card className="bg-background border-y border-dashed p-3 text-sm">
              Actions
            </Card>
            <div className="p-3">
              {/* Current Attempt Info */}
              <div className="space-y-2">
                <CurrentAttempt
                  task={task}
                  projectHasDevScript={projectHasDevScript ?? false}
                  selectedAttempt={selectedAttempt}
                  taskAttempts={attempts}
                  handleEnterCreateAttemptMode={() =>
                    setUserForcedCreateMode(true)
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default TaskDetailsToolbar;
