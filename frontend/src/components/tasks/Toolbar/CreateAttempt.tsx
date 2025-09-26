import { Dispatch, SetStateAction, useCallback } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { X } from 'lucide-react';
import type { GitBranch, Task } from 'shared/types';
import type { ExecutorConfig } from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';
import type { TaskAttempt } from 'shared/types';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import BranchSelector from '@/components/tasks/BranchSelector.tsx';
import { ExecutorProfileSelector } from '@/components/settings';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

type Props = {
  task: Task;
  branches: GitBranch[];
  taskAttempts: TaskAttempt[];
  selectedProfile: ExecutorProfileId | null;
  selectedBranch: string | null;
  setIsInCreateAttemptMode: Dispatch<SetStateAction<boolean>>;
  setSelectedBranch: Dispatch<SetStateAction<string | null>>;
  setSelectedProfile: Dispatch<SetStateAction<ExecutorProfileId | null>>;
  availableProfiles: Record<string, ExecutorConfig> | null;
  selectedAttempt: TaskAttempt | null;
};

function CreateAttempt({
  task,
  branches,
  taskAttempts,
  selectedProfile,
  selectedBranch,
  setIsInCreateAttemptMode,
  setSelectedBranch,
  setSelectedProfile,
  availableProfiles,
  selectedAttempt,
}: Props) {
  const { isAttemptRunning } = useAttemptExecution(selectedAttempt?.id);
  const { createAttempt, isCreating } = useAttemptCreation(task.id);

  const handleExitCreateAttemptMode = () => {
    setIsInCreateAttemptMode(false);
  };

  const handleCreateAttempt = useCallback(async () => {
    if (!selectedProfile || !selectedBranch) {
      return;
    }

    await createAttempt({
      profile: selectedProfile,
      baseBranch: selectedBranch,
    });

    setIsInCreateAttemptMode(false);
  }, [
    selectedProfile,
    selectedBranch,
    createAttempt,
    setIsInCreateAttemptMode,
  ]);

  return (
    <div className="">
      <Card className="bg-background p-3 text-sm border-y border-dashed">
        Create Attempt
      </Card>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          {taskAttempts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExitCreateAttemptMode}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center">
          <label className="text-xs font-medium text-muted-foreground">
            Each time you start an attempt, a new session is initiated with your
            selected coding agent, and a git worktree and corresponding task
            branch are created.
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          {/* Top Row: Executor Profile and Variant (spans 2 columns) */}
          {availableProfiles && (
            <div className="col-span-1 sm:col-span-2">
              <ExecutorProfileSelector
                profiles={availableProfiles}
                selectedProfile={selectedProfile}
                onProfileSelect={setSelectedProfile}
                showLabel={true}
              />
            </div>
          )}

          {/* Bottom Row: Base Branch and Start Button */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">
              Base branch <span className="text-destructive">*</span>
            </Label>
            <BranchSelector
              branches={branches}
              selectedBranch={selectedBranch}
              onBranchSelect={(branch) => setSelectedBranch(branch)}
              placeholder="Select branch"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium opacity-0">Start</Label>
            <Button
              onClick={handleCreateAttempt}
              disabled={
                !selectedProfile ||
                !selectedBranch ||
                isAttemptRunning ||
                isCreating
              }
              size="sm"
              className="w-full text-xs gap-2 justify-center bg-black text-white hover:bg-black/90"
              title={
                !selectedBranch
                  ? 'Base branch is required'
                  : !selectedProfile
                    ? 'Coding agent is required'
                    : undefined
              }
            >
              {isCreating ? 'Creating...' : 'Start'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateAttempt;
