import { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { X } from 'lucide-react';
import type { Task } from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';
import type { TaskAttempt } from 'shared/types';
import { useAttemptCreation } from '@/hooks/useAttemptCreation';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useAttemptBranch } from '@/hooks/useAttemptBranch';
import { useProjectBranches } from '@/hooks/useProjectBranches';
import { useUserSystem } from '@/components/config-provider';
import BranchSelector from '@/components/tasks/BranchSelector.tsx';
import { ExecutorProfileSelector } from '@/components/settings';

import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

type Props = {
  task: Task;
  taskAttempts: TaskAttempt[];
  onExitCreateMode: () => void;
  selectedAttempt: TaskAttempt | null;
};

function CreateAttempt({
  task,
  taskAttempts,
  onExitCreateMode,
  selectedAttempt,
}: Props) {
  const { isAttemptRunning } = useAttemptExecution(selectedAttempt?.id);
  const { createAttempt, isCreating } = useAttemptCreation(task.id);
  // Data state
  const { branches, pickBranch } = useProjectBranches(task.project_id, {
    enabled: true,
  });
  const { branch: parentBranch, isLoading: isLoadingParentBranch } =
    useAttemptBranch(task.parent_task_attempt);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] =
    useState<ExecutorProfileId | null>(null);
  const { system, profiles } = useUserSystem();

  // Memoize latest attempt calculation
  const latestAttempt = useMemo(() => {
    if (taskAttempts.length === 0) return null;
    return taskAttempts.reduce((latest, current) =>
      new Date(current.created_at) > new Date(latest.created_at)
        ? current
        : latest
    );
  }, [taskAttempts]);

  // Set default executor from config
  useEffect(() => {
    if (system.config?.executor_profile) {
      setSelectedProfile(system.config.executor_profile);
    }
  }, [system.config?.executor_profile]);

  useEffect(() => {
    setSelectedBranch(null); // Force re-initialization
  }, [task.id]);

  useEffect(() => {
    if (selectedBranch !== null || isLoadingParentBranch) {
      return;
    }
    const next = pickBranch(latestAttempt?.target_branch, parentBranch);

    if (next) {
      setSelectedBranch(next);
    }
  }, [
    pickBranch,
    latestAttempt?.target_branch,
    parentBranch,
    selectedBranch,
    isLoadingParentBranch,
  ]);

  const handleCreateAttempt = useCallback(async () => {
    if (!selectedProfile || !selectedBranch) {
      return;
    }

    await createAttempt({
      profile: selectedProfile,
      baseBranch: selectedBranch,
    });

    onExitCreateMode();
  }, [selectedProfile, selectedBranch, createAttempt, onExitCreateMode]);

  return (
    <div className="">
      <Card className="bg-background p-3 text-sm border-y border-dashed">
        Create Attempt
      </Card>
      <div className="space-y-3 p-3">
        <div className="flex items-center justify-between">
          {taskAttempts.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onExitCreateMode}>
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
          {profiles && (
            <div className="col-span-1 sm:col-span-2">
              <ExecutorProfileSelector
                profiles={profiles}
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
              onBranchSelect={setSelectedBranch}
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
